import { z } from 'zod';
// @ts-ignore
import { createStep } from '@mastra/core/workflows';
import { getReviewRepository } from '@/adapter/db';
import { createCombinedMessageFromExtractedDocument } from '../lib';
import {
  createRuntimeContext,
  judgeFinishReason,
} from '@/mastra/lib/agentUtils';
import { ReviewExecuteAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { createHash } from 'crypto';
import { ReviewEvaluation } from '@/types';
import { stepStatus } from '../../types';
import { getMainLogger } from '@/main/lib/logger';
import {
  documentReviewExecutionInputSchema,
  documentReviewExecutionOutputSchema,
} from '.';
import { getChecklistsErrorMessage } from './lib';

const logger = getMainLogger();

export const smallDocumentReviewExecutionStep = createStep({
  id: 'smallDocumentReviewExecutionStep',
  description: 'チェックリストごとにレビューを実行するステップ',
  inputSchema: documentReviewExecutionInputSchema,
  outputSchema: documentReviewExecutionOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    // レビュー対象のファイル
    const {
      documents,
      additionalInstructions,
      commentFormat,
      evaluationSettings,
    } = inputData;
    // ステップ1からの入力を取得
    const { checklists } = inputData;

    // リポジトリを取得
    const reviewRepository = getReviewRepository();

    try {
      const reviewAgent = mastra.getAgent('reviewExecuteAgent');

      // 複数ファイルを統合してメッセージを作成（一度だけ）
      const message = await createCombinedMessageFromExtractedDocument(
        documents,
        'Please review this document against the provided checklist items',
      );

      // レビューを実行(各カテゴリ内のチェックリストは一括でレビュー)
      // レビュー結果に含まれなかったチェックリストは再度レビューを実行する（最大試行回数は3回）
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
            // CoTのようにAIにどのファイルのどのセクションをレビューするべきかを考えさせるための隠しフィールド
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
        runtimeContext.set('checklistItems', checklists);
        runtimeContext.set('additionalInstructions', additionalInstructions);
        runtimeContext.set('commentFormat', commentFormat);
        runtimeContext.set('evaluationSettings', evaluationSettings);

        // チェックリスト一覧をメッセージの最後にリマインドとして追加
        const checklistReminder = `## Checklist Items to Review:
${checklists.map((item) => `- ID: ${item.id} - ${item.content}`).join('\n')}

Please review the document against the above checklist items.`;

        // メッセージのcontentの最後にリマインダーを追加
        const messageWithReminder = {
          ...message,
          content: [
            ...message.content,
            {
              type: 'text' as const,
              text: checklistReminder,
            },
          ],
        };

        // レビューエージェントを使用してレビューを実行
        const reviewResult = await reviewAgent.generate(messageWithReminder, {
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
        return bail({
          status: 'failed' as stepStatus,
          errorMessage: getChecklistsErrorMessage(targetChecklists, 'AIの出力にレビュー結果が含まれませんでした'),
        });
      }
      // 全てのレビューが成功した場合
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      logger.error(error, 'チェックリストのレビュー実行処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      const errorMessage = normalizedError.message;
      // エラーが発生した場合はエラー情報を返す
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: getChecklistsErrorMessage(checklists, errorMessage),
      });
    }
  },
});
