// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
import { stepStatus } from '../../types';
import { getReviewRepository } from '@/adapter/db';
import { getMainLogger } from '@/main/lib/logger';
import { makeChunksByCount } from '@/mastra/lib/util';
import {
  getTotalChunksStep,
  getTotalChunksStepInputSchema,
  getTotalChunksStepOutputSchema,
} from './getTotalChunksStep';
import {
  researchChunkStep,
  researchChunkStepInputSchema,
} from './researchDocumentChunk';
import { input } from '@testing-library/user-event/dist/cjs/event/input.js';

const logger = getMainLogger();

const researchDocumentWithRetryInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentId: z.string(),
  researchContent: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
});

const researchDocumentWithRetryOutputSchema = baseStepOutputSchema.extend({
  documentId: z.string().optional(),
  researchResult: z.string().optional(),
});

export const researchDocumentWithRetryWorkflow = createWorkflow({
  id: 'researchDocumentWithRetryWorkflow',
  inputSchema: researchDocumentWithRetryInputSchema,
  outputSchema: researchDocumentWithRetryOutputSchema,
})
  .map(async ({ inputData }) => {
    return inputData as z.infer<typeof getTotalChunksStepInputSchema>;
  })
  .then(getTotalChunksStep)
  .map(async ({ inputData, getInitData, bail }) => {
    if (inputData.status === 'failed') {
      return bail(inputData);
    }
    const initData = (await getInitData()) as z.infer<
      typeof researchDocumentWithRetryInputSchema
    >;
    return {
      ...inputData,
      checklistIds: initData.checklistIds,
      question: initData.question,
    } as z.infer<typeof getTotalChunksStepOutputSchema> & {
      checklistIds: number[];
      question: string;
    };
  })
  .dountil(
    createWorkflow({
      id: 'chunkResearchInnerWorkflow',
      inputSchema: getTotalChunksStepOutputSchema.extend({
        checklistIds: z.array(z.number()),
        question: z.string(),
      }),
      outputSchema: researchDocumentWithRetryOutputSchema,
    })
      .map(async ({ inputData }) => {
        const { reviewHistoryId, documentId, researchContent, totalChunks } =
          inputData;
        const reviewRepository = getReviewRepository();

        // ドキュメントキャッシュを取得
        const documentCache =
          await reviewRepository.getReviewDocumentCacheByDocumentId(
            reviewHistoryId,
            documentId,
          );

        if (!documentCache) {
          throw new Error(`Document not found: ${documentId}`);
        }

        // ドキュメントをtotalChunks分に分割
        const chunks: Array<{ text?: string; images?: string[] }> = [];

        if (documentCache.processMode === 'text' && documentCache.textContent) {
          // テキストをチャンク分割
          const chunkRanges = makeChunksByCount(
            documentCache.textContent,
            totalChunks,
            0,
          );
          chunkRanges.forEach((range) => {
            chunks.push({
              text: documentCache.textContent!.substring(
                range.start,
                range.end,
              ),
            });
          });
        } else if (
          documentCache.processMode === 'image' &&
          documentCache.imageData
        ) {
          // 画像配列をチャンク分割
          const chunkRanges = makeChunksByCount(
            documentCache.imageData,
            totalChunks,
            0,
          );
          chunkRanges.forEach((range) => {
            chunks.push({
              images: documentCache.imageData!.slice(range.start, range.end),
            });
          });
        }

        // 各チャンクに対する調査タスクを作成
        return chunks.map((chunk, index) => ({
          reviewHistoryId,
          documentId,
          researchContent,
          chunkContent: chunk,
          chunkIndex: index,
          totalChunks,
          fileName: documentCache.fileName,
          checklistIds: inputData.checklistIds,
          question: inputData.question,
        })) as z.infer<typeof researchChunkStepInputSchema>[];
      })
      .foreach(researchChunkStep, { concurrency: 5 })
      .map(async ({ inputData, bail, getInitData }) => {
        const results = inputData;

        // いずれかのチャンクでコンテキスト長エラーがあったかチェック
        const hasContentLengthError = results.some(
          (result) => result.finishReason === 'content_length',
        );

        // 失敗があればエラー
        if (results.some((result) => result.status === 'failed')) {
          const failed = results.find((result) => result.status === 'failed');
          return bail({
            status: 'failed' as stepStatus,
            errorMessage: failed?.errorMessage || 'チャンク調査に失敗しました',
            finishReason: 'error' as const,
          });
        }

        const initData = (await getInitData()) as z.infer<
          typeof getTotalChunksStepOutputSchema
        >;

        if (hasContentLengthError) {
          // チャンク数を増やして再試行
          return {
            status: 'success' as stepStatus,
            reviewHistoryId: initData.reviewHistoryId,
            documentId: initData.documentId,
            researchContent: initData.researchContent,
            totalChunks: initData.totalChunks + 1,
            finishReason: 'content_length' as const,
          };
        }

        // すべて成功したらチャンク結果を統合
        const combinedResult = results
          .filter((result) => result.chunkResult)
          .map((result, index) => `[Chunk ${index + 1}]\n${result.chunkResult}`)
          .join('\n\n');

        return {
          status: 'success' as stepStatus,
          documentId: initData.documentId,
          researchResult: combinedResult,
          finishReason: 'success' as const,
        };
      })
      .commit(),
    async ({ inputData }) => {
      // 再試行上限または成功したら終了
      if ((inputData as any).totalChunks >= 10) {
        return true;
      }
      if ((inputData as any).finishReason !== 'content_length') {
        return true;
      }
      return false;
    },
  )
  .map(async ({ inputData }) => {
    // 最終結果を返す
    return {
      status: inputData.status,
      documentId: inputData.documentId,
      researchResult: inputData.researchResult,
      errorMessage: (inputData as any).errorMessage,
    };
  })
  .commit();
