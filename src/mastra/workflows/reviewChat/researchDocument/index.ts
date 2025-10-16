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
} from './getTotalChunksStep';
import {
  researchChunkStep,
  researchChunkStepInputSchema,
} from './researchDocumentChunk';
import { internalError } from '@/main/lib/error';

const logger = getMainLogger();

const researchDocumentWithRetryInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentCacheId: z.number(),
  researchContent: z.string(),
  reasoning: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
});

const researchDocumentWithRetryOutputSchema = baseStepOutputSchema.extend({
  documentCacheId: z.number().optional(),
  researchResult: z.string().optional(),
});

const chunkResearchInnerWorkflowInputSchema = baseStepOutputSchema.extend({
  checklistIds: z.array(z.number()),
  question: z.string(),
  retryCount: z.number(),
  reviewHistoryId: z.string(),
  documentCacheId: z.number(),
  researchContent: z.string(),
  reasoning: z.string(),
  totalChunks: z.number(),
  researchResult: z.string().optional(),
  finishReason: z.enum(['success', 'error', 'content_length']),
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
      reasoning: initData.reasoning,
      retryCount: 0,
      finishReason: 'error' as const,
    } as z.infer<typeof chunkResearchInnerWorkflowInputSchema>;
  })
  .dountil(
    createWorkflow({
      id: 'chunkResearchInnerWorkflow',
      inputSchema: chunkResearchInnerWorkflowInputSchema,
      outputSchema: chunkResearchInnerWorkflowInputSchema,
    })
      .map(async ({ inputData }) => {
        const {
          reviewHistoryId,
          documentCacheId,
          researchContent,
          totalChunks,
        } = inputData;
        const reviewRepository = getReviewRepository();

        // ドキュメントキャッシュを取得
        const documentCache =
          await reviewRepository.getReviewDocumentCacheById(documentCacheId);

        if (!documentCache) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_DOCUMENT_CACHE_NOT_FOUND',
          });
        }

        // ドキュメントをtotalChunks分に分割
        const chunks: Array<{ text?: string; images?: string[] }> = [];

        if (documentCache.processMode === 'text' && documentCache.textContent) {
          // テキストをチャンク分割
          const chunkRanges = makeChunksByCount(
            documentCache.textContent,
            totalChunks,
            300,
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
            3,
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
          documentCacheId,
          researchContent,
          chunkContent: chunk,
          chunkIndex: index,
          totalChunks,
          fileName: documentCache.fileName,
          checklistIds: inputData.checklistIds,
          question: inputData.question,
          reasoning: inputData.reasoning,
        })) as z.infer<typeof researchChunkStepInputSchema>[];
      })
      .foreach(researchChunkStep, { concurrency: 5 })
      .map(async ({ inputData, bail, getInitData }) => {
        const initData = (await getInitData()) as z.infer<
          typeof chunkResearchInnerWorkflowInputSchema
        >;

        const results = inputData;

        // いずれかのチャンクでコンテキスト長エラーがあったかチェック
        const hasContentLengthError = results.some(
          (result) => result.finishReason === 'content_length',
        );

        // コンテキスト長エラーがない場合、失敗が一つでもある場合は失敗として返す
        if (
          !hasContentLengthError &&
          results.some((result) => result.status === 'failed')
        ) {
          const failed = results.find((result) => result.status === 'failed');
          return {
            status: 'failed' as stepStatus,
            errorMessage: failed?.errorMessage,
            finishReason: 'error' as const,
            retryCount: initData.retryCount,
            documentCacheId: initData.documentCacheId,
          } as z.infer<typeof chunkResearchInnerWorkflowInputSchema>;
        }

        // リトライ回数が5回を超えたら終了
        // レビュー実行時にドキュメント分割できることを確認しているため、ここには到達しないはず
        if (initData.retryCount >= 5) {
          return {
            status: 'failed' as stepStatus,
            errorMessage: 'ドキュメントが長すぎて処理できませんでした。',
            finishReason: 'error' as const,
            retryCount: initData.retryCount,
            documentCacheId: initData.documentCacheId,
          } as z.infer<typeof chunkResearchInnerWorkflowInputSchema>;
        }

        if (hasContentLengthError) {
          // チャンク数を増やして再試行
          return {
            status: 'success' as stepStatus,
            reviewHistoryId: initData.reviewHistoryId,
            documentCacheId: initData.documentCacheId,
            researchContent: initData.researchContent,
            reasoning: initData.reasoning,
            totalChunks: initData.totalChunks + 1,
            finishReason: 'content_length' as const,
            checklistIds: initData.checklistIds,
            question: initData.question,
            retryCount: initData.retryCount + 1,
          } as z.infer<typeof chunkResearchInnerWorkflowInputSchema>;
        }

        // すべて成功したらチャンク結果を統合
        // ドキュメントキャッシュを取得
        const reviewRepository = getReviewRepository();
        const documentCache = await reviewRepository.getReviewDocumentCacheById(
          initData.documentCacheId,
        );
        if (!documentCache) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_DOCUMENT_CACHE_NOT_FOUND',
          });
        }
        // チャンク情報は削除し、調査結果のみを結合
        const combinedResult = results
          .filter((result) => result.chunkResult)
          .map(
            (result) =>
              `Document Name:\n${documentCache.fileName}${initData.totalChunks > 1 ? ` ※(Chunk ${result.chunkIndex! + 1}/${initData.totalChunks})(split into chunks because the full content did not fit into context)` : ''}\nResearch Findings:\n${result.chunkResult}`,
          )
          .join('\n\n---\n\n');

        return {
          status: 'success' as stepStatus,
          documentCacheId: initData.documentCacheId,
          researchResult: combinedResult,
          finishReason: 'success' as const,
          retryCount: initData.retryCount,
        } as z.infer<typeof chunkResearchInnerWorkflowInputSchema>;
      })
      .commit(),
    async ({ inputData }) => {
      // 再試行上限または成功したら終了
      if (inputData.retryCount >= 5) {
        return true;
      }
      if (inputData.finishReason !== 'content_length') {
        return true;
      }
      return false;
    },
  )
  .map(async ({ inputData }) => {
    // 最終結果を返す
    return {
      status: inputData.status,
      documentCacheId: inputData.documentCacheId,
      researchResult: inputData.researchResult,
      errorMessage: inputData.errorMessage,
    };
  })
  .commit();
