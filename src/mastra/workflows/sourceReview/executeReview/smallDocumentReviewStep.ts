import { z } from 'zod';
// @ts-ignore
import { createStep } from '@mastra/core/workflows';
import { getReviewRepository } from '@/adapter/db';
import { createCombinedMessageFromExtractedDocument } from '../lib';
import {
  createRuntimeContext,
  judgeFinishReason,
  getModelSpecificGenerateOptions,
} from '@/mastra/lib/agentUtils';
import { ReviewExecuteAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { ReviewEvaluation } from '@/types';
import { stepStatus } from '../../types';
import { logError } from '@/main/lib/logger';
import {
  documentReviewExecutionInputSchema,
  documentReviewExecutionOutputSchema,
} from '.';
import { deduplicateByChecklistId, saveChecklistErrors } from './lib';
import { buildDocumentFormatContext } from '@/mastra/lib/extractionFormatDescription';
import { extractedDocumentSchema } from './schema';

/**
 * 少量ドキュメントレビューの共通実行関数
 *
 * smallDocumentReviewExecutionStep と autoDocumentModeJudge の両方から利用される。
 * ドキュメントメッセージ構築・RuntimeContext設定・チェックリストリマインダー追加・エージェント呼び出しを共通化。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeSmallDocumentReview(params: {
  reviewAgent: any;
  documents: Array<z.infer<typeof extractedDocumentSchema>>;
  checklists: Array<{ id: number; content: string }>;
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: { items: { label: string; description: string }[] };
  outputSchema: z.ZodType;
  abortSignal?: AbortSignal;
}) {
  const {
    reviewAgent,
    documents,
    checklists,
    additionalInstructions,
    commentFormat,
    evaluationSettings,
    outputSchema,
    abortSignal,
  } = params;

  // ドキュメントメッセージを構築
  const message = createCombinedMessageFromExtractedDocument(
    documents,
    'Please review this document against the provided checklist items',
  );

  // RuntimeContextを設定
  const runtimeContext =
    await createRuntimeContext<ReviewExecuteAgentRuntimeContext>();
  runtimeContext.set('checklistItems', checklists);
  runtimeContext.set('additionalInstructions', additionalInstructions);
  runtimeContext.set('commentFormat', commentFormat);
  runtimeContext.set('evaluationSettings', evaluationSettings);

  // ドキュメントフォーマットコンテキストを設定
  const documentFormatContext = buildDocumentFormatContext(
    documents.map((doc) => ({
      name: doc.name,
      formatType: doc.formatType,
      processMode: doc.processMode || 'text',
      includeImages: doc.includeImages ?? false,
    })),
  );
  if (documentFormatContext) {
    runtimeContext.set('documentFormatContext', documentFormatContext);
  }

  // チェックリストリマインダーを追加
  const checklistReminder = `## Checklist Items to Review:
${checklists.map((item) => `- ID: ${item.id} - ${item.content}`).join('\n')}

Please review the document against the above checklist items.`;

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
  return reviewAgent.generateLegacy(messageWithReminder, {
    output: outputSchema,
    runtimeContext,
    abortSignal,
    maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
    ...getModelSpecificGenerateOptions(runtimeContext),
  });
}

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

    // catchブロックからアクセスできるようにtryの外で宣言
    let targetChecklists = checklists;

    try {
      const reviewAgent = mastra.getAgent('reviewExecuteAgent');

      // レビューを実行(各カテゴリ内のチェックリストは一括でレビュー)
      // レビュー結果に含まれなかったチェックリストは再度レビューを実行する（最大試行回数は3回）
      const maxAttempts = 3;
      let attempt = 0;
      // リトライ間の重複保存防止: DB保存済みのchecklistIdを追跡
      const savedChecklistIds = new Set<number>();
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

        // 共通関数を使用してレビューを実行
        const reviewResult = (await executeSmallDocumentReview({
          reviewAgent,
          documents,
          checklists,
          additionalInstructions,
          commentFormat,
          evaluationSettings,
          outputSchema,
          abortSignal,
        })) as { finishReason?: string; object?: unknown };
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
        // レビュー結果をDBに保存（重複排除・リトライ間重複排除を適用）
        if (reviewResult.object && Array.isArray(reviewResult.object)) {
          // AI応答内の重複を排除
          const { deduplicated } = deduplicateByChecklistId(
            reviewResult.object,
          );
          // リトライ間の重複を排除（既にDB保存済みのchecklistIdをスキップ）
          const newResults = deduplicated.filter(
            (result) => !savedChecklistIds.has(result.checklistId),
          );
          if (newResults.length > 0) {
            await reviewRepository.upsertReviewResult(
              newResults.map((result) => ({
                reviewChecklistId: result.checklistId,
                evaluation: result.evaluation as ReviewEvaluation,
                comment: result.comment,
              })),
            );
            for (const result of newResults) {
              savedChecklistIds.add(result.checklistId);
            }
          }
        }
        // レビュー結果に含まれなかったチェックリストを抽出（重複排除済みの結果ベース）
        targetChecklists = targetChecklists.filter(
          (checklist) => !savedChecklistIds.has(checklist.id),
        );
        if (targetChecklists.length === 0) {
          // 全てのチェックリストがレビューされた場合、成功
          break;
        }
        attempt += 1;
      }
      if (attempt >= maxAttempts) {
        // 最大試行回数に達した場合、エラーをDBに保存してステップは成功として返す
        await saveChecklistErrors(
          targetChecklists,
          'AIの出力にレビュー結果が含まれませんでした',
        );
      }
      // 全てのレビューが成功した場合（またはエラーをDB保存済みの場合）
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      logError(error, 'チェックリストのレビュー実行処理に失敗しました', {
        documentNames: documents?.map((d) => d.name),
        checklistCount: checklists?.length,
      });
      const normalizedError = normalizeUnknownError(error);
      // DB保存エラー（レビュー結果保存失敗等）はインフラエラーのため、従来通りワークフローを失敗させる
      if (normalizedError.messageCode === 'DATA_ACCESS_ERROR') {
        return bail({
          status: 'failed' as stepStatus,
          errorMessage: normalizedError.message,
        });
      }
      const errorMessage = normalizedError.message;
      // レビュー処理エラーの場合はDBに保存してステップは成功として返す
      await saveChecklistErrors(targetChecklists, errorMessage);
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    }
  },
});
