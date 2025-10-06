// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../../types';
import { individualDocumentReviewStep } from './individualDocumentReviewStep';
import { consolidateReviewStep } from './consolidateReviewStep';
import { getMainLogger } from '@/main/lib/logger';
import {
  documentReviewExecutionInputSchema,
  documentReviewExecutionOutputSchema,
} from '..';
import { baseStepOutputSchema } from '@/mastra/workflows/schema';
import { makeChunksByCount } from '@/mastra/lib/util';
import { extractedDocumentSchema } from '../schema';

const logger = getMainLogger();

const individualDocumentReviewRetryWorkflowInputSchema =
  individualDocumentReviewStep.outputSchema.extend({
    originalDocument: individualDocumentReviewStep.inputSchema.shape.document,
    reviewInput: z.array(individualDocumentReviewStep.inputSchema),
    retryCount: z.number(),
  });

const individualDocumentReviewWorkflowOutputSchema =
  baseStepOutputSchema.extend({
    documentsWithReviewResults: z
      .array(
        extractedDocumentSchema.extend({
          originalName: z.string(),
          reviewResults: z.array(
            z.object({
              checklistId: z.number(),
              comment: z.string().describe('evaluation comment'),
            }),
          ),
        }),
      )
      .optional(),
  });

/**
 * 個別ドキュメントレビューワークフロー
 * 個別ドキュメントレビューを実行し、コンテキスト長エラーになった時のみ分割してリトライする
 */
const individualDocumentReviewWorkflow = createWorkflow({
  id: 'individualDocumentReviewWorkflow',
  inputSchema: individualDocumentReviewStep.inputSchema,
  outputSchema: individualDocumentReviewWorkflowOutputSchema,
})
  .map(async ({ inputData }) => {
    return {
      originalDocument: inputData.document,
      reviewInput: [inputData],
      retryCount: 0,
      finishReason: 'error' as const,
    } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
  })
  .dountil(
    createWorkflow({
      id: 'individualDocumentReviewRetryWorkflow',
      inputSchema: individualDocumentReviewRetryWorkflowInputSchema,
      outputSchema: individualDocumentReviewRetryWorkflowInputSchema,
    })
      .map(async ({ inputData }) => {
        return inputData.reviewInput as z.infer<
          typeof individualDocumentReviewStep.inputSchema
        >[];
      })
      .foreach(individualDocumentReviewStep, { concurrency: 5 })
      .map(async ({ inputData, getInitData }) => {
        const initData = (await getInitData()) as z.infer<
          typeof individualDocumentReviewRetryWorkflowInputSchema
        >;
        // リトライ回数をインクリメント
        const nextRetryCount = initData.retryCount + 1;

        // 全て成功している場合は成功として返す
        if (inputData.every((item) => item.status === 'success')) {
          return {
            originalDocument: initData.originalDocument,
            reviewInput: initData.reviewInput,
            reviewResults: inputData.flatMap(
              (item) => item.reviewResults || [],
            ),
            retryCount: nextRetryCount,
            status: 'success' as stepStatus,
            finishReason: 'success' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // どれかの個別レビューがコンテキスト長エラーで失敗していた場合は再度分割してリトライする
        // リトライ対象かどうかを判定
        const isRetryNeeded = inputData.some(
          (item) =>
            item.status === 'failed' && item.finishReason === 'content_length',
        );
        if (!isRetryNeeded) {
          // 失敗が一つでもある場合は失敗として返す
          const isFailed = inputData.some((item) => item.status === 'failed');
          // エラーメッセージは最初の失敗から取得
          let errorMessage: string | undefined = undefined;
          for (const item of inputData) {
            if (item.status === 'failed' && item.errorMessage) {
              errorMessage = item.errorMessage;
              break;
            }
          }
          return {
            originalDocument: initData.originalDocument,
            reviewInput: [],
            retryCount: nextRetryCount,
            status: isFailed
              ? ('failed' as stepStatus)
              : ('succeeded' as stepStatus),
            errorMessage,
            finishReason: isFailed
              ? ('error' as const)
              : ('succeeded' as const),
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // リトライ回数が5回を超えたら終了
        if (initData.retryCount >= 5) {
          return {
            originalDocument: initData.originalDocument,
            reviewInput: [],
            retryCount: nextRetryCount,
            status: 'failed' as stepStatus,
            errorMessage:
              'ドキュメント分割を複数回実行しましたが、コンテキスト長エラーが解消されませんでした',
            finishReason: 'error' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // ドキュメント分割処理を実行
        // 分割方針は、originalDocumentを単純に${nextRetryCount + 1}に分割し、テキストドキュメントであればオーバーラップを300文字、PDF画像ドキュメントであれば3画像分オーバーラップさせる
        const splitCount = nextRetryCount + 1;

        if (initData.originalDocument.textContent) {
          // --- テキストドキュメント ---
          // 絵文字分断を避けたい場合は、下記を Array.from(...) に替える
          const text = initData.originalDocument.textContent;
          const overlapChars = 300;

          const ranges = makeChunksByCount(text, splitCount, overlapChars);

          const chunks = ranges.map(({ start, end }) => text.slice(start, end));

          return {
            originalDocument: initData.originalDocument,
            reviewInput: chunks.map((chunk, index) => ({
              ...initData.reviewInput[0],
              document: {
                ...initData.originalDocument,
                id: `${initData.originalDocument.id}_part${index + 1}`,
                name: `${initData.originalDocument.name} (part ${index + 1}) (split into parts because the full content did not fit into context)`,
                textContent: chunk,
              },
            })),
            retryCount: nextRetryCount,
            status: 'success' as stepStatus,
            finishReason: 'content_length' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        } else if (initData.originalDocument.imageData) {
          // --- PDF画像（ページ配列想定）---
          const imageData = initData.originalDocument.imageData;
          const overlapPages = 3;

          const ranges = makeChunksByCount(imageData, splitCount, overlapPages);

          const chunks = ranges.map(({ start, end }) =>
            imageData.slice(start, end),
          );

          return {
            originalDocument: initData.originalDocument,
            reviewInput: chunks.map((chunk, index) => ({
              ...initData.reviewInput[0],
              document: {
                ...initData.originalDocument,
                id: `${initData.originalDocument.id}_part${index + 1}`,
                name: `${initData.originalDocument.name} (part ${index + 1}) (split into parts because the full content did not fit into context)`,
                imageData: chunk,
              },
            })),
            retryCount: nextRetryCount,
            status: 'success' as stepStatus,
            finishReason: 'content_length' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // ここには到達しないはず
        return {
          originalDocument: initData.originalDocument,
          reviewInput: [],
          retryCount: nextRetryCount,
          status: 'failed' as stepStatus,
          errorMessage: '予期せぬエラーが発生しました',
          finishReason: 'error' as const,
        } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
      })
      .commit(),
    async ({ inputData }) => {
      if (inputData.retryCount >= 4) {
        return true;
      }
      if (inputData.finishReason !== 'content_length') {
        return true;
      }
      return false;
    },
  )
  .map(async ({ inputData }) => {
    // 個別ドキュメントレビューの結果をまとめて返す
    if (inputData.status === 'failed') {
      return {
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      } as z.infer<typeof individualDocumentReviewWorkflowOutputSchema>;
    }
    return {
      status: 'success' as stepStatus,
      documentsWithReviewResults: inputData.reviewInput.map((input) => {
        const reviewResult = inputData.reviewResults?.filter(
          (result) => result.documentId === input.document.id,
        );
        return {
          ...input.document,
          reviewResults: reviewResult || [],
        };
      }),
    } as z.infer<typeof individualDocumentReviewWorkflowOutputSchema>;
  })
  .commit();

/**
 * 大量ドキュメントレビューワークフロー
 * 個別ドキュメントレビュー（並列実行） → レビュー結果統合の流れ
 */
export const largeDocumentReviewWorkflow = createWorkflow({
  id: 'largeDocumentReviewWorkflow',
  inputSchema: documentReviewExecutionInputSchema,
  outputSchema: documentReviewExecutionOutputSchema,
})
  .map(async ({ inputData }) => {
    // 各ドキュメントに対する個別レビューのタスクを作成
    return inputData.documents.map(
      (document) =>
        ({
          reviewHistoryId: inputData.reviewHistoryId,
          document: {
            ...document,
            originalName: document.name, // 分割された場合に元の名前を保持するため
          },
          checklists: inputData.checklists,
          additionalInstructions: inputData.additionalInstructions,
          commentFormat: inputData.commentFormat,
          evaluationSettings: inputData.evaluationSettings,
        }) as z.infer<typeof individualDocumentReviewStep.inputSchema>,
    );
  })
  .foreach(individualDocumentReviewWorkflow, { concurrency: 5 })
  .map(async ({ inputData, bail, getInitData }) => {
    const initData = (await getInitData()) as z.infer<
      typeof documentReviewExecutionInputSchema
    >;

    // どれかの個別レビューが失敗していた場合は全体を失敗とする
    if (inputData.some((item) => item.status === 'failed')) {
      // 最初の失敗からエラーメッセージを取得
      let errorMessage: string = '予期せぬエラーが発生しました';
      for (const item of inputData) {
        if (item.status === 'failed' && item.errorMessage) {
          errorMessage = item.errorMessage;
          break;
        }
      }
      return bail({
        status: 'failed' as stepStatus,
        errorMessage,
      });
    }

    // レビュー結果統合のためのデータを準備
    return {
      documentsWithReviewResults: inputData.flatMap(
        (item) => item.documentsWithReviewResults,
      ),
      checklists: initData.checklists,
      additionalInstructions: initData.additionalInstructions,
      commentFormat: initData.commentFormat,
      evaluationSettings: initData.evaluationSettings,
    } as z.infer<typeof consolidateReviewStep.inputSchema>;
  })
  .then(consolidateReviewStep)
  .commit();
