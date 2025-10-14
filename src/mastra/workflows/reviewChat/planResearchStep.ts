// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import { getReviewRepository } from '@/adapter/db';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { ReviewChatPlanningAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import {
  createRuntimeContext,
  judgeFinishReason,
} from '@/mastra/lib/agentUtils';
import { reviewChatInputSchema } from '.';

const logger = getMainLogger();

// Step 1: 調査計画作成
const planResearchStepOutputSchema = baseStepOutputSchema.extend({
  researchTasks: z
    .array(
      z.object({
        documentId: z.string(),
        researchContent: z.string(),
      }),
    )
    .optional(),
});

export const planResearchStep = createStep({
  id: 'planResearchStep',
  description: '調査計画を作成するステップ',
  inputSchema: reviewChatInputSchema,
  outputSchema: planResearchStepOutputSchema,
  execute: async ({ inputData, bail, mastra }) => {
    try {
      const { reviewHistoryId, checklistIds, question } = inputData;
      const reviewRepository = getReviewRepository();

      // チェックリスト結果と個別レビュー結果を取得
      const checklistResults =
        await reviewRepository.getChecklistResultsWithIndividualResults(
          reviewHistoryId,
          checklistIds,
        );

      // ドキュメント一覧を取得
      const documentCaches =
        await reviewRepository.getReviewDocumentCaches(reviewHistoryId);

      // RuntimeContext作成
      const availableDocuments = documentCaches.map((doc) => ({
        id: doc.documentId,
        fileName: doc.fileName,
      }));

      // チェックリスト情報の文字列を生成
      const checklistInfo = checklistResults
        .map((item) => {
          let info = `Checklist ID: ${item.checklistResult.id}\nContent: ${item.checklistResult.content}\n`;
          if (item.checklistResult.sourceEvaluation) {
            info += `Review Result:\n  Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}\n  Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}\n`;
          }
          if (item.individualResults && item.individualResults.length > 0) {
            info += `Individual Review Results:\n`;
            item.individualResults.forEach((result) => {
              info += `  - Document ID: ${result.documentId}\n    Document Name: ${result.individualFileName}\n    Comment: ${result.comment}\n`;
            });
          }
          return info;
        })
        .join('\n---\n');

      // RuntimeContext作成
      const runtimeContext =
        await createRuntimeContext<ReviewChatPlanningAgentRuntimeContext>();
      runtimeContext.set('availableDocuments', availableDocuments);
      runtimeContext.set('checklistInfo', checklistInfo);

      // 構造化出力用のスキーマ
      const researchTasksSchema = z.object({
        tasks: z.array(
          z.object({
            reasoning: z
              .string()
              .describe('Reason for selecting this document for research'),
            documentId: z.string().describe('Document ID to investigate'),
            researchContent: z
              .string()
              .describe('Detailed research instructions for this document'),
          }),
        ),
      });

      // Mastraエージェント経由でAI呼び出し（構造化出力）
      const planningAgent = mastra.getAgent('reviewChatPlanningAgent');
      const result = await planningAgent.generate(question, {
        runtimeContext,
        output: researchTasksSchema,
      });

      const { success, reason } = judgeFinishReason(result.finishReason);
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      // 構造化出力から調査タスクを取得
      const researchTasks = result.object?.tasks || [];

      return {
        status: 'success' as stepStatus,
        researchTasks,
      };
    } catch (error) {
      logger.error(error, '調査計画の作成に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});
