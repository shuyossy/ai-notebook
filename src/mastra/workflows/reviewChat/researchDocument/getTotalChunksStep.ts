// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
import { stepStatus } from '../../types';
import { getReviewRepository } from '@/adapter/db';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError } from '@/main/lib/error';

const logger = getMainLogger();

const getTotalChunksStepInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentId: z.string(),
  researchContent: z.string(),
});

export const getTotalChunksStepOutputSchema = baseStepOutputSchema.extend({
  reviewHistoryId: z.string(),
  documentId: z.string(),
  researchContent: z.string(),
  totalChunks: z.number(),
});

export const getTotalChunksStep = createStep({
  id: 'getTotalChunksStep',
  description: '最大チャンク数を取得するステップ',
  inputSchema: getTotalChunksStepInputSchema,
  outputSchema: getTotalChunksStepOutputSchema,
  execute: async ({ inputData, bail }) => {
    try {
      const { reviewHistoryId, documentId, researchContent } = inputData;
      const reviewRepository = getReviewRepository();

      // 既存の最大チャンク数を取得
      const totalChunks = await reviewRepository.getMaxTotalChunksForDocument(
        reviewHistoryId,
        documentId,
      );

      return {
        status: 'success' as stepStatus,
        reviewHistoryId,
        documentId,
        researchContent,
        totalChunks,
      };
    } catch (error) {
      logger.error(error, '最大チャンク数の取得に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});
