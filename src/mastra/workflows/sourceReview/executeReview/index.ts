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
import { IReviewRepository } from '@/main/service/port/repository';
import { determineDocumentMode } from './autoDocumentModeJudge';

const logger = getMainLogger();

/**
 * キャッシュからロードされたドキュメントにcacheIdを付与するヘルパー
 * (textExtractionStepでキャッシュからロードした場合、cacheIdは未設定のため)
 */
async function assignCacheIdsToDocuments(
  reviewRepository: IReviewRepository,
  reviewHistoryId: string,
  extractedDocuments:
    | Array<{ cacheId?: number; [key: string]: unknown } | undefined>
    | undefined,
): Promise<void> {
  const cachedDocuments =
    await reviewRepository.getReviewDocumentCaches(reviewHistoryId);
  for (let i = 0; i < (extractedDocuments || []).length; i++) {
    const document = extractedDocuments![i];
    if (!document) continue;
    if (cachedDocuments[i]) {
      document.cacheId = cachedDocuments[i].id;
    }
  }
}

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
    .enum(['small', 'large', 'auto'])
    .default('small')
    .describe(
      'ドキュメントモード: small=少量ドキュメント, large=大量ドキュメント, auto=自動判定',
    ),
  // リトライモード (undefinedの場合は初回レビュー)
  retryMode: z
    .enum(['all', 'uncompleted-only'])
    .optional()
    .describe(
      'リトライモード: all=全てのチェックリスト, uncompleted-only=未完了のみ',
    ),
  // レビュー対象のドキュメント (リトライ時はオプション)
  files: z.array(uploadedFileSchema).optional(),
});

export const executeReviewWorkflowOutputSchema = baseStepOutputSchema;

export const documentReviewExecutionInputSchema = z.object({
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
  // レビュー対象のドキュメント
  documents: z.array(extractedDocumentSchema),
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
  documentMode: z.enum(['small', 'large']).default('small'),
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
        return {
          reviewHistoryId: inputData.reviewHistoryId,
          files: inputData.files,
        } as z.infer<typeof textExtractionStep.inputSchema>;
      })
      .then(textExtractionStep)
      .commit(),
    createWorkflow({
      id: 'classifyChecklistsByCategory',
      inputSchema: executeReviewWorkflowInputSchema,
      outputSchema: classifyChecklistsByCategoryStep.outputSchema,
    })
      .map(async ({ inputData }) => {
        return {
          reviewHistoryId: inputData.reviewHistoryId,
          retryMode: inputData.retryMode,
        } as z.infer<typeof classifyChecklistsByCategoryStep.inputSchema>;
      })
      .then(classifyChecklistsByCategoryStep)
      .commit(),
  ])
  // ドキュメントレビューをループするためのinputに変換(大量ドキュメントも少量ドキュメントも同じ形にする)
  .map(async ({ inputData, bail, getInitData, mastra }) => {
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

    const reviewRepository = getReviewRepository();

    // キャッシュ管理: リトライモードに応じた処理
    if (!initData.retryMode) {
      // シナリオ1: 初回レビュー (retryMode undefined)
      // 全キャッシュと結果を削除
      await reviewRepository.deleteReviewLargedocumentResultCaches(
        initData.reviewHistoryId,
      );
      await reviewRepository.deleteReviewDocumentCaches(
        initData.reviewHistoryId,
      );
      await reviewRepository.deleteAllReviewResults(initData.reviewHistoryId);

      // documentModeを保存 (autoの場合は判定後に保存)
      if (initData.documentMode !== 'auto') {
        await reviewRepository.updateReviewHistoryDocumentMode(
          initData.reviewHistoryId,
          initData.documentMode as 'small' | 'large',
        );
      }

      // ドキュメントキャッシュを作成
      for (const document of textExtractionResult.extractedDocuments || []) {
        if (!document) continue;
        const savedCache = await reviewRepository.createReviewDocumentCache({
          reviewHistoryId: initData.reviewHistoryId,
          fileName: document.name || '',
          processMode: document.processMode || 'text',
          textContent: document.textContent,
          imageData: document.imageData,
          extractedImages: document.extractedImages,
          formatType: document.formatType ?? null,
          includeImages: document.includeImages ?? false,
        });
        // キャッシュIDを付与
        document.cacheId = savedCache.id;
      }

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
    } else if (initData.retryMode === 'all') {
      // シナリオ2: 全てのチェックリストをリトライ
      // 大量ドキュメントキャッシュとレビュー結果を削除、ドキュメントキャッシュは保持
      await reviewRepository.deleteReviewLargedocumentResultCaches(
        initData.reviewHistoryId,
      );
      await reviewRepository.deleteAllReviewResults(initData.reviewHistoryId);

      // キャッシュからロードされたドキュメントにcacheIdを付与
      await assignCacheIdsToDocuments(
        reviewRepository,
        initData.reviewHistoryId,
        textExtractionResult.extractedDocuments,
      );
    } else if (initData.retryMode === 'uncompleted-only') {
      // シナリオ3: 未完了チェックリストのみリトライ
      // 未完了チェックリストの大量ドキュメントキャッシュのみ削除
      const uncompletedChecklistIds = classifyChecklistsResult
        .categories!.flatMap((cat) => cat.checklists)
        .map((checklist) => checklist.id);

      if (uncompletedChecklistIds.length > 0) {
        await reviewRepository.deleteReviewLargedocumentResultCachesByChecklistIds(
          initData.reviewHistoryId,
          uncompletedChecklistIds,
        );
      }

      // キャッシュからロードされたドキュメントにcacheIdを付与
      await assignCacheIdsToDocuments(
        reviewRepository,
        initData.reviewHistoryId,
        textExtractionResult.extractedDocuments,
      );
    }

    // 自動判定: documentModeが'auto'の場合
    let resolvedDocumentMode: 'small' | 'large';
    if (initData.documentMode === 'auto') {
      resolvedDocumentMode = await determineDocumentMode({
        mastra,
        documents: textExtractionResult.extractedDocuments!.filter(
          (d): d is NonNullable<typeof d> => d != null,
        ),
        categories: classifyChecklistsResult.categories!,
        additionalInstructions: initData.additionalInstructions,
        commentFormat: initData.commentFormat,
        evaluationSettings: initData.evaluationSettings,
      });
      // 判定結果をDBに保存
      await reviewRepository.updateReviewHistoryDocumentMode(
        initData.reviewHistoryId,
        resolvedDocumentMode,
      );
    } else {
      resolvedDocumentMode = initData.documentMode as 'small' | 'large';
    }

    return classifyChecklistsResult.categories!.map((category) => {
      return {
        reviewHistoryId: initData.reviewHistoryId,
        documents: textExtractionResult.extractedDocuments!,
        checklists: category.checklists,
        additionalInstructions: initData.additionalInstructions,
        commentFormat: initData.commentFormat,
        evaluationSettings: initData.evaluationSettings,
        documentMode: resolvedDocumentMode,
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
    { concurrency: 2 },
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
