// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
import { stepStatus } from '../../types';
import { textExtractionStep } from './textExtractionStep';
import { getMainLogger } from '@/main/lib/logger';
import { classifyChecklistsByCategoryStep } from './classifyChecklistStep';
import { smallDocumentReviewExecutionStep } from './smallDocumentReviewStep';
import { largeDocumentReviewWorkflow } from './largeDocumentReview';
import { extractedDocumentSchema, uploadedFileSchema } from './schema';
import { getReviewRepository } from '@/adapter/db';

const logger = getMainLogger();

// レビュー機能で利用する定数定義

// 一つのカテゴリに含めるチェックリストの最大数
export const MAX_CHECKLISTS_PER_CATEGORY = 1;
// 分割カテゴリの最大数
export const MAX_CATEGORIES = 50;

// レビュー実行のメインワークフロー入力スキーマ
export const executeReviewWorkflowInputSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
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
    .describe('カスタム評定項目設定'),
  documentMode: z
    .enum(['small', 'large'])
    .default('small')
    .describe(
      'ドキュメントモード: small=少量ドキュメント, large=大量ドキュメント',
    ),
  // レビュー対象のドキュメント
  files: z.array(uploadedFileSchema),
});

export const executeReviewWorkflowOutputSchema = baseStepOutputSchema;

export const documentReviewExecutionInputSchema = z.object({
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
    .describe('カスタム評定項目設定'),
  // レビュー対象のドキュメント
  documents: z.array(extractedDocumentSchema),
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
});

export const documentReviewExecutionOutputSchema = baseStepOutputSchema;

// レビュー実行のメインワークフロー
export const executeReviewWorkflow = createWorkflow({
  id: 'executeReviewWorkflow',
  inputSchema: executeReviewWorkflowInputSchema,
  outputSchema: executeReviewWorkflowOutputSchema,
})
  // ステップ1: テキスト抽出とカテゴリ分割
  .parallel([
    createWorkflow({
      id: 'textExtraction',
      inputSchema: executeReviewWorkflowInputSchema,
      outputSchema: textExtractionStep.outputSchema,
    })
      .map(async ({ inputData }) => {
        return { files: inputData.files } as z.infer<
          typeof textExtractionStep.inputSchema
        >;
      })
      .then(textExtractionStep)
      .commit(),
    createWorkflow({
      id: 'classifyChecklistsByCategory',
      inputSchema: executeReviewWorkflowInputSchema,
      outputSchema: classifyChecklistsByCategoryStep.outputSchema,
    })
      .map(async ({ inputData }) => {
        return { reviewHistoryId: inputData.reviewHistoryId } as z.infer<
          typeof classifyChecklistsByCategoryStep.inputSchema
        >;
      })
      .then(classifyChecklistsByCategoryStep)
      .commit(),
  ])
  // ドキュメントレビューをループするためのinputに変換(大量ドキュメントも少量ドキュメントも同じ形にする)
  .map(async ({ inputData, bail, getInitData }) => {
    const textExtractionResult = inputData.textExtraction;
    const classifyChecklistsResult = inputData.classifyChecklistsByCategory;

    if (textExtractionResult.status !== 'success') {
      return bail({
        status: 'failed' as stepStatus,
        errorMessage:
          textExtractionResult.errorMessage || 'テキスト抽出に失敗しました',
      });
    }
    if (classifyChecklistsResult.status !== 'success') {
      return bail({
        status: 'failed' as stepStatus,
        errorMessage:
          classifyChecklistsResult.errorMessage ||
          'チェックリストのカテゴリ分割に失敗しました',
      });
    }

    const initData = (await getInitData()) as z.infer<
      typeof executeReviewWorkflowInputSchema
    >;

    // 既存のレビュー結果を全て削除
    const reviewRepository = getReviewRepository();
    await reviewRepository.deleteAllReviewResults(initData.reviewHistoryId);

    // レビュー対象の統合ドキュメント名を保存
    const targetDocumentName = (textExtractionResult.extractedDocuments || [])
      .map((doc) => doc?.name || '')
      .filter((name) => name)
      .join('/');
    if (targetDocumentName) {
      await reviewRepository.updateReviewHistoryTargetDocumentName(
        initData.reviewHistoryId,
        targetDocumentName,
      );
    }

    return classifyChecklistsResult.categories!.map((category) => {
      return {
        documents: textExtractionResult.extractedDocuments!,
        checklists: category.checklists,
        additionalInstructions: initData.additionalInstructions,
        commentFormat: initData.commentFormat,
        evaluationSettings: initData.evaluationSettings,
        documentMode: initData.documentMode,
      } as z.infer<typeof documentReviewExecutionInputSchema>;
    });
  })
  .foreach(
    createWorkflow({
      id: 'documentReview',
      inputSchema: documentReviewExecutionInputSchema,
      outputSchema: baseStepOutputSchema,
    })
      .branch([
        [
          async ({ getInitData }) => {
            const initData = (await getInitData()) as z.infer<
              typeof executeReviewWorkflowInputSchema
            >;
            return initData.documentMode === 'small';
          },
          smallDocumentReviewExecutionStep,
        ],
        [
          async ({ getInitData }) => {
            const initData = (await getInitData()) as z.infer<
              typeof executeReviewWorkflowInputSchema
            >;
            return initData.documentMode === 'large';
          },
          largeDocumentReviewWorkflow,
        ],
      ])
      .map(async ({ inputData, bail }) => {
        let reviewExecutionResult:
          | z.infer<typeof documentReviewExecutionOutputSchema>
          | undefined;
        if (inputData.smallDocumentReviewExecutionStep) {
          reviewExecutionResult = inputData.smallDocumentReviewExecutionStep;
        } else if (inputData.largeDocumentReviewWorkflow) {
          reviewExecutionResult = inputData.largeDocumentReviewWorkflow;
        }
        if (!reviewExecutionResult) {
          return bail({
            status: 'failed' as stepStatus,
            errorMessage: '不明なエラー',
          });
        }
        return bail(reviewExecutionResult);
      })
      .commit(),
    { concurrency: 5 },
  )
  .map(async ({ inputData, bail }) => {
    // failedになった結果を集約
    const failedResults = inputData.filter(
      (item) => item.status === 'failed' && item.errorMessage,
    );
    if (failedResults.length > 0) {
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: failedResults.map((r) => r.errorMessage).join('\n'),
      });
    }
    // 全て成功した場合
    return {
      status: 'success' as stepStatus,
    };
  })
  .commit();
