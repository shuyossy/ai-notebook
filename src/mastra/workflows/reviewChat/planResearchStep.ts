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
import { judgeReviewMode, buildPlanningChecklistInfo } from './lib';

const logger = getMainLogger();

// Step 1: 調査計画作成
const planResearchStepOutputSchema = baseStepOutputSchema.extend({
  researchTasks: z
    .array(
      z.object({
        documentCacheId: z.number(),
        researchContent: z.string(),
        reasoning: z.string(), // 調査理由を追加
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
        id: doc.id,
        fileName: doc.fileName,
      }));

      // レビュー方式を判定（ヘルパー関数を利用）
      const reviewMode = judgeReviewMode(checklistResults);

      // チェックリスト情報の文字列を生成（ヘルパー関数を利用）
      const checklistInfo = buildPlanningChecklistInfo(checklistResults);

      // RuntimeContext作成
      const runtimeContext =
        await createRuntimeContext<ReviewChatPlanningAgentRuntimeContext>();
      runtimeContext.set('availableDocuments', availableDocuments);
      runtimeContext.set('checklistInfo', checklistInfo);
      runtimeContext.set('reviewMode', reviewMode);

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
      const result = await planningAgent.generateLegacy(question, {
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
      const researchTasks = (result.object?.tasks || []).map((task) => ({
        documentCacheId: Number(task.documentId),
        researchContent: task.researchContent,
        reasoning: task.reasoning,
      }));

      if (researchTasks.length === 0) {
        throw internalError({
          expose: true,
          messageCode: 'AI_INVALID_RESPONSE'
        });
      }

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
