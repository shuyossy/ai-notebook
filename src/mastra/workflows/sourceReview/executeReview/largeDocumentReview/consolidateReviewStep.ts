// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../../schema';
import { stepStatus } from '../../../types';
import { getReviewRepository } from '@/adapter/db';
import type { ConsolidateReviewAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { normalizeUnknownError } from '@/main/lib/error';
import { internalError } from '@/main/lib/error';
import {
  createRuntimeContext,
  judgeFinishReason,
} from '@/mastra/lib/agentUtils';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();
import type { ReviewEvaluation } from '@/types';
import { createHash } from 'crypto';
import { extractedDocumentSchema } from '../schema';

// レビュー結果統合ステップの入力スキーマ
export const consolidateReviewStepInputSchema = z.object({
  documentsWithReviewResults: z.array(
    extractedDocumentSchema.extend({
      originalName: z.string(),
      reviewResults: z.array(
        z.object({
          checklistId: z.number(),
          comment: z.string().describe('evaluation comment'),
        }),
      ),
    }),
  ),
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
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
    .describe('カスタム評価項目設定'),
});

// レビュー結果統合ステップの出力スキーマ
export const consolidateReviewStepOutputSchema = baseStepOutputSchema;

/**
 * レビュー結果統合ステップ
 * 個別ドキュメントのレビュー結果を統合して最終的なレビュー結果を作成
 */
export const consolidateReviewStep = createStep({
  id: 'consolidateReviewStep',
  description: '個別レビュー結果の統合ステップ',
  inputSchema: consolidateReviewStepInputSchema,
  outputSchema: consolidateReviewStepOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    const {
      documentsWithReviewResults,
      checklists,
      additionalInstructions,
      commentFormat,
      evaluationSettings,
    } = inputData;

    const reviewRepository = getReviewRepository();

    try {
      const consolidateAgent = mastra.getAgent('consolidateReviewAgent');

      // 個別レビュー結果を整理
      const consolidatedInput = documentsWithReviewResults.map((docResult) => {
        return {
          originalName: docResult?.originalName || docResult?.name || `Document ${docResult.id}`,
          documentName: docResult?.name || `Document ${docResult.id}`,
          reviewResults: docResult.reviewResults,
        };
      });

      // 統合レビューメッセージを構築
      const reviewMessage = {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `Please consolidate the following individual document review results into a comprehensive final review.

## Document Set Information:
Original Files: ${[...new Set(consolidatedInput.map(doc => doc.originalName))].join(', ')}

## Individual Document Review Results:
${consolidatedInput
  .map((docResult) => {
    const isPartOfSplit = docResult.originalName !== docResult.documentName;
    return `### Document: ${docResult.documentName}${isPartOfSplit ? ` (part of ${docResult.originalName})` : ''}
${docResult.reviewResults
  .map((result) => {
    const checklistItem = checklists.find((c) => c.id === result.checklistId);
    return `
**Checklist ID ${result.checklistId}**: ${checklistItem?.content || 'Unknown'}
- **Comment**: ${result.comment}`;
  })
  .join('\n')}`;
  })
  .join('\n\n')}

## Checklist Items for Consolidation:
${checklists.map((item) => `- ID: ${item.id} - ${item.content}`).join('\n')}

Please provide a consolidated review that synthesizes all individual document reviews into a unified assessment for the entire document set.`,
          },
        ],
      };

      // 統合レビューを実行（最大3回まで再試行）
      const maxAttempts = 3;
      let attempt = 0;
      let targetChecklists = checklists;

      while (attempt < maxAttempts) {
        // デフォルトの評価項目
        const defaultEvaluationItems = ['A', 'B', 'C', '-'] as const;

        // カスタム評価項目があるか確認
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
            comment: z.string().describe('evaluation comment'),
            evaluation: evaluationEnum.describe('evaluation'),
          }),
        );

        const runtimeContext =
          await createRuntimeContext<ConsolidateReviewAgentRuntimeContext>();
        runtimeContext.set('additionalInstructions', additionalInstructions);
        runtimeContext.set('commentFormat', commentFormat);
        runtimeContext.set('evaluationSettings', evaluationSettings);
        runtimeContext.set('checklistItems', targetChecklists);

        // 統合レビューエージェントを使用して統合レビューを実行
        const consolidatedResult = await consolidateAgent.generate(
          reviewMessage,
          {
            output: outputSchema,
            runtimeContext,
            abortSignal,
          },
        );

        const { success, reason } = judgeFinishReason(
          consolidatedResult.finishReason,
        );
        if (!success) {
          throw internalError({
            expose: true,
            messageCode: 'AI_API_ERROR',
            messageParams: { detail: reason },
          });
        }

        // 統合レビュー結果をDBに保存
        if (
          consolidatedResult.object &&
          Array.isArray(consolidatedResult.object)
        ) {
          await reviewRepository.upsertReviewResult(
            consolidatedResult.object.map((result) => ({
              reviewChecklistId: result.checklistId,
              evaluation: result.evaluation as ReviewEvaluation,
              comment: result.comment,
            })),
          );
        }

        // レビュー結果に含まれなかったチェックリストを抽出
        const reviewedChecklistIds = new Set(
          consolidatedResult.object && Array.isArray(consolidatedResult.object)
            ? consolidatedResult.object.map((result) => result.checklistId)
            : [],
        );
        targetChecklists = targetChecklists.filter(
          (checklist) => !reviewedChecklistIds.has(checklist.id),
        );

        if (targetChecklists.length === 0) {
          // 全てのチェックリストが統合レビューされた場合、成功
          break;
        }
        attempt += 1;
      }

      if (attempt >= maxAttempts) {
        // 最大試行回数に達した場合、失敗したチェックリストを記録
        return {
          status: 'failed' as stepStatus,
          errorMessage: `${targetChecklists?.map((c) => `・${c.content}:AIの出力に統合レビュー結果が含まれませんでした`).join('\n')}`,
        };
      }

      // 全ての統合レビューが成功した場合
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      logger.error(error, 'レビュー結果統合処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      const errorMessage = normalizedError.message;
      // エラーが発生した場合はエラー情報を返す
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: `${checklists?.map((c) => `・${c.content}:${errorMessage}`).join('\n')}`,
      });
    }
  },
});
