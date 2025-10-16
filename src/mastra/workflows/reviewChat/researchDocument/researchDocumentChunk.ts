// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
import { stepStatus } from '../../types';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { ReviewChatResearchAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import {
  createRuntimeContext,
  judgeFinishReason,
  judgeErrorIsContentLengthError,
} from '@/mastra/lib/agentUtils';
import { getReviewRepository } from '@/adapter/db';
import {
  judgeReviewMode,
  buildResearchChecklistInfo,
} from '../lib';

const logger = getMainLogger();

export const researchChunkStepInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentCacheId: z.number(),
  researchContent: z.string(),
  chunkContent: z.object({
    text: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
  chunkIndex: z.number(),
  totalChunks: z.number(),
  fileName: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
  reasoning: z.string(),
});

const researchChunkStepOutputSchema = baseStepOutputSchema.extend({
  chunkResult: z.string().optional(),
  chunkIndex: z.number().optional(),
  finishReason: z.enum(['success', 'error', 'content_length']).optional(),
});

export const researchChunkStep = createStep({
  id: 'researchChunkStep',
  description: 'チャンク単位でドキュメントを調査するステップ',
  inputSchema: researchChunkStepInputSchema,
  outputSchema: researchChunkStepOutputSchema,
  execute: async ({ inputData, bail, mastra, getInitData }) => {
    try {
      const {
        researchContent,
        chunkContent,
        chunkIndex,
        totalChunks,
        fileName,
        reviewHistoryId,
        checklistIds,
        question,
        reasoning,
      } = inputData;

      // チェックリスト情報を生成（ヘルパー関数を利用）
      const reviewRepository = getReviewRepository();
      const checklistResults =
        await reviewRepository.getChecklistResultsWithIndividualResults(
          reviewHistoryId,
          checklistIds,
        );

      // レビューモードを判定（ヘルパー関数を利用）
      const reviewMode = judgeReviewMode(checklistResults);

      // チェックリスト情報の文字列を生成（ヘルパー関数を利用）
      const checklistInfo = buildResearchChecklistInfo(checklistResults);

      // RuntimeContext作成
      const runtimeContext =
        await createRuntimeContext<ReviewChatResearchAgentRuntimeContext>();
      runtimeContext.set('researchContent', researchContent);
      runtimeContext.set('totalChunks', totalChunks);
      runtimeContext.set('chunkIndex', chunkIndex);
      runtimeContext.set('fileName', fileName);
      runtimeContext.set('checklistInfo', checklistInfo);
      runtimeContext.set('userQuestion', question);
      runtimeContext.set('reasoning', reasoning);
      runtimeContext.set('reviewMode', reviewMode);

      // メッセージを作成
      const messageContent = [];

      if (chunkContent.text) {
        // テキストチャンクの場合
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${fileName}\n\nResearch Instructions: ${researchContent}\n\nDocument Content:\n${chunkContent.text}`,
        });
      } else if (chunkContent.images && chunkContent.images.length > 0) {
        // 画像チャンクの場合
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${fileName}\n\nResearch Instructions: ${researchContent}\n\nPlease analyze the following document images:`,
        });

        chunkContent.images.forEach((imageBase64) => {
          messageContent.push({
            type: 'image' as const,
            image: imageBase64,
            mimeType: 'image/png',
          });
        });
      }

      // Mastraエージェント経由でAI呼び出し
      const researchAgent = mastra.getAgent('reviewChatResearchAgent');
      const result = await researchAgent.generate(
        {
          role: 'user',
          content: messageContent,
        },
        {
          runtimeContext,
        },
      );

      const { success, reason } = judgeFinishReason(result.finishReason);

      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      return {
        status: 'success' as stepStatus,
        chunkIndex,
        chunkResult: result.text,
        finishReason: 'success' as const,
      };
    } catch (error) {
      // コンテキスト長エラーの場合は特別な処理
      if (judgeErrorIsContentLengthError(error)) {
        return {
          status: 'success' as stepStatus,
          chunkIndex: inputData.chunkIndex,
          finishReason: 'content_length' as const,
        };
      }

      logger.error(error, 'チャンク調査に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
        finishReason: 'error' as const,
      });
    }
  },
});
