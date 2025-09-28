// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { NoObjectGeneratedError } from 'ai';
import { baseStepOutputSchema } from '@/mastra/workflows/schema';
import { stepStatus } from '@/mastra/workflows/types';
import { getReviewRepository } from '@/adapter/db';
import { createRuntimeContext, judgeFinishReason } from '@/mastra/lib/agentUtils';
import { ReviewExecuteAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { createHash } from 'crypto';
import { ReviewEvaluation } from '@/types';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

const reviewExecutionStepInputSchema = z.object({
  additionalInstructions: z
    .string()
    .optional()
    .describe('レビューに対する追加指示'),
  commentFormat: z
    .string()
    .optional()
    .describe('レビューコメントのフォーマット'),
  evaluationSettings: z
    .object({
      items: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
        }),
      ),
    })
    .optional()
    .describe('カスタム評定項目設定'),
  // レビュー対象のドキュメント
  documents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      type: z.string(),
      pdfProcessMode: z.enum(['text', 'image']).optional(),
      pdfImageMode: z.enum(['merged', 'pages']).optional(),
      textContent: z.string().optional(),
      imageData: z.array(z.string()).optional(),
      topicAndSummary: z.array(
        z.object({
          topic: z.string().describe('ドキュメントから抽出されたトピック'),
          summary: z
            .string()
            .describe('そのトピックに関するドキュメントの要約'),
        }),
      ),
      qnA: z
        .array(
          z.object({
            question: z.string().describe('ドキュメントに関する質問'),
            answer: z.string().describe('その質問に対する回答'),
          }),
        )
        .describe('ドキュメントに関する質問・回答の蓄積情報'),
    }),
  ),
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
});

const reviewExecutionStepOutputSchema = baseStepOutputSchema.extend({
  failedChecklists: z
    .array(
      z.object({
        id: z.number(),
        content: z.string().describe('レビューに失敗したチェックリストの内容'),
      }),
    )
    .optional(),
});

export const largeDocumentReviewExecutionStep = createStep({
  id: 'largeDocumentReviewExecutionStep',
  description: '大量ドキュメント用のレビュー実行ステップ（要約・Q&A情報を使用）',
  inputSchema: reviewExecutionStepInputSchema,
  outputSchema: reviewExecutionStepOutputSchema,
  execute: async ({ inputData, mastra, abortSignal }) => {
    const {
      documents,
      checklists,
      additionalInstructions,
      commentFormat,
      evaluationSettings,
    } = inputData;

    const reviewRepository = getReviewRepository();

    try {
      const reviewAgent = mastra.getAgent('largeDocumentReviewExecuteAgent');

      // ドキュメント情報を整理したメッセージを作成
      const documentInfo = documents.map(doc => {
        const topicsSummary = doc.topicAndSummary
          .map(ts => `**Topic: ${ts.topic}**\n${ts.summary}`)
          .join('\n\n');

        const qnaInfo = doc.qnA
          .map(qa => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join('\n\n');

        return `# Document: ${doc.name} (ID: ${doc.id})

## Topics and Summaries:
${topicsSummary}

## Q&A Information:
${qnaInfo}`;
      }).join('\n\n---\n\n');

      // レビューメッセージを構築
      const reviewMessage = {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `Please review the following documents based on the provided checklist items.

${documentInfo}

## Checklist Items to Review:
${checklists.map((item) => `- ID: ${item.id} - ${item.content}`).join('\n')}

Please provide a thorough review based on the document summaries, topics, and Q&A information provided above.`,
          },
        ],
      };

      // レビューを実行(各カテゴリ内のチェックリストは一括でレビュー)
      const maxAttempts = 3;
      let attempt = 0;
      let targetChecklists = checklists;

      while (attempt < maxAttempts) {
        // デフォルトの評定項目
        const defaultEvaluationItems = ['A', 'B', 'C', '-'] as const;

        // カスタム評定項目がある場合はそれを使用、なければデフォルトを使用
        const evaluationItems = evaluationSettings?.items?.length
          ? evaluationSettings.items.map((item) => item.label)
          : defaultEvaluationItems;

        // 最初の要素が存在することを確認してenumを作成
        const evaluationEnum =
          evaluationItems.length > 0
            ? z.enum([evaluationItems[0], ...evaluationItems.slice(1)] as [
                string,
                ...string[],
              ])
            : z.enum(defaultEvaluationItems);

        const outputSchema = z.array(
          z.object({
            checklistId: z.number(),
            reviewSections: z
              .array(
                z.object({
                  fileName: z.string().describe('file name to review'),
                  sectionNames: z.array(
                    z.string().describe('section name within the file'),
                  ),
                }),
              )
              .describe(
                'files and sections that should be reviewed for evaluation and commenting',
              ),
            comment: z.string().describe('evaluation comment'),
            evaluation: evaluationEnum.describe('evaluation'),
          }),
        );

        const runtimeContext =
          await createRuntimeContext<ReviewExecuteAgentRuntimeContext>();
        runtimeContext.set('checklistItems', targetChecklists);
        runtimeContext.set('additionalInstructions', additionalInstructions);
        runtimeContext.set('commentFormat', commentFormat);
        runtimeContext.set('evaluationSettings', evaluationSettings);

        // レビューエージェントを使用してレビューを実行
        const reviewResult = await reviewAgent.generate(reviewMessage, {
          output: outputSchema,
          runtimeContext,
          abortSignal,
        });

        const { success, reason } = judgeFinishReason(
          reviewResult.finishReason,
        );
        if (!success) {
          throw internalError({
            expose: true,
            messageCode: 'AI_API_ERROR',
            messageParams: { detail: reason },
          });
        }

        // レビュー結果をDBに保存（複数ファイルの情報を統合）
        if (reviewResult.object && Array.isArray(reviewResult.object)) {
          const combinedFileIds = documents.map((f) => f.id).join('/');
          const idsHash = createHash('md5')
            .update(combinedFileIds)
            .digest('hex');
          const combinedFileNames = documents.map((f) => f.name).join('/');

          await reviewRepository.upsertReviewResult(
            reviewResult.object.map((result) => ({
              reviewChecklistId: result.checklistId,
              evaluation: result.evaluation as ReviewEvaluation,
              comment: result.comment,
              fileId: idsHash,
              fileName: combinedFileNames,
            })),
          );
        }

        // レビュー結果に含まれなかったチェックリストを抽出
        const reviewedChecklistIds = new Set(
          reviewResult.object && Array.isArray(reviewResult.object)
            ? reviewResult.object.map((result) => result.checklistId)
            : [],
        );
        targetChecklists = targetChecklists.filter(
          (checklist) => !reviewedChecklistIds.has(checklist.id),
        );

        if (targetChecklists.length === 0) {
          // 全てのチェックリストがレビューされた場合、成功
          break;
        }
        attempt += 1;
      }

      if (attempt >= maxAttempts) {
        // 最大試行回数に達した場合、レビューに失敗したドキュメントを記録
        return {
          status: 'failed' as stepStatus,
          errorMessage: `${targetChecklists?.map((c) => `・${c.content}:AIの出力にレビュー結果が含まれませんでした`).join('\n')}`,
        };
      }

      // 全てのレビューが成功した場合
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      logger.error(error, '大量ドキュメントレビュー実行処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      const errorMessage = normalizedError.message;
      // エラーが発生した場合はエラー情報を返す
      return {
        status: 'failed' as stepStatus,
        errorMessage: `${checklists?.map((c) => `・${c.content}:${errorMessage}`).join('\n')}`,
      };
    }
  },
});
