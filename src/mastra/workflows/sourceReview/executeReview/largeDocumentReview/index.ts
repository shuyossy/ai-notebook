// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../../types';
import { individualDocumentReviewStep } from './individualDocumentReviewStep';
import { consolidateReviewStep } from './consolidateReviewStep';
import { getMainLogger, logError } from '@/main/lib/logger';
import { normalizeUnknownError } from '@/main/lib/error';
import {
  documentReviewExecutionInputSchema,
  documentReviewExecutionOutputSchema,
} from '..';
import { baseStepOutputSchema } from '@/mastra/workflows/schema';
import { makeChunksByCount } from '@/mastra/lib/util';
import { extractedDocumentSchema } from '../schema';
import { getReviewRepository, getSettingsRepository } from '@/adapter/db';
import { saveChecklistErrors } from '../lib';
import { getTokenizer } from '@/main/lib/tokenizer';
import {
  getModelMaxContextLength,
  getModelMaxImageCount,
} from '@/config/modelConfig';
import { isRichFormatType } from '@/main/lib/utils/formatHelper';
import { filterReferencedImages } from '@/mastra/lib/util';

const logger = getMainLogger();

// 分割上限（retryCount 0→2分割, ..., 4→6分割, 5→上限到達）
const MAX_SPLIT_COUNT = 6;
// 早期終了判定バッファ（10%の余裕を持たせる）
const EARLY_TERMINATION_BUFFER = 0.1;
// コンテキスト長マージン（チェックリストやプロンプト用に20%を確保）
const CONTEXT_LENGTH_MARGIN = 0.2;
// テキスト分割時のオーバーラップ文字数
const OVERLAP_CHARS = 300;
// 画像分割時のオーバーラップページ数
const OVERLAP_PAGES = 3;

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
    // 事前分割: トークン数に基づいてドキュメントを事前に分割する
    const tokenizer = getTokenizer();
    const settingsRepository = getSettingsRepository();
    const settings = await settingsRepository.getSettings();
    const modelName = settings.api.model;
    const maxContextLength = getModelMaxContextLength(modelName);

    // チェックリストのトークン数を計算
    const checklistText = inputData.checklists.map((c) => c.content).join('\n');
    const checklistTokens = tokenizer.countTokens(checklistText);

    // 利用可能トークン数 = コンテキスト長 - チェックリスト分 - マージン
    const availableTokens =
      maxContextLength -
      checklistTokens -
      Math.floor(maxContextLength * CONTEXT_LENGTH_MARGIN);

    const maxImageCount = getModelMaxImageCount(modelName);

    // (A) 画像変換モードの事前分割
    if (
      inputData.document.processMode === 'image' &&
      inputData.document.imageData &&
      inputData.document.imageData.length > maxImageCount
    ) {
      const imageData = inputData.document.imageData;
      const preSplitCount = Math.ceil(imageData.length / maxImageCount);
      logger.info(
        `事前分割（画像モード）: ドキュメント "${inputData.document.name}" の画像数(${imageData.length})が最大画像数(${maxImageCount})を超過 → ${preSplitCount}分割`,
      );

      // 分割上限でキャップ（早期終了チェックとの閾値差によるエッジケース防止）
      const cappedSplitCount = Math.min(preSplitCount, MAX_SPLIT_COUNT);
      const ranges = makeChunksByCount(
        imageData,
        cappedSplitCount,
        OVERLAP_PAGES,
      );
      const chunks = ranges.map(({ start, end }) =>
        imageData.slice(start, end),
      );

      return {
        originalDocument: inputData.document,
        reviewInput: chunks.map((chunk, index) => ({
          ...inputData,
          document: {
            ...inputData.document,
            id: `${inputData.document.id}_part${index + 1}`,
            name: `${inputData.document.name} (part ${index + 1}) (split into parts because the full content did not fit into context)`,
            originalName:
              inputData.document.originalName || inputData.document.name,
            imageData: chunk,
            totalChunks: cappedSplitCount,
            chunkIndex: index,
          },
        })),
        retryCount: cappedSplitCount - 1,
        finishReason: 'error' as const,
      } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
    }

    // (B) テキストモードの事前分割
    if (inputData.document.textContent && availableTokens > 0) {
      const documentTokens = tokenizer.countTokens(
        inputData.document.textContent,
      );

      // トークン数に基づく事前分割数を算出
      let preSplitCount =
        documentTokens > availableTokens
          ? Math.ceil(documentTokens / availableTokens)
          : 1;

      // リッチ戦略成功 + 画像含む場合、画像数に基づいて分割数を調整
      if (
        isRichFormatType(inputData.document.formatType) &&
        inputData.document.includeImages
      ) {
        const allImages = inputData.document.extractedImages || [];
        if (allImages.length > maxImageCount) {
          const text = inputData.document.textContent;
          // 現在の分割数で画像が収まるか確認、収まらなければ分割数を増やす
          while (preSplitCount < MAX_SPLIT_COUNT) {
            const ranges = makeChunksByCount(
              text,
              preSplitCount,
              OVERLAP_CHARS,
            );
            const allChunksFit = ranges.every(({ start, end }) => {
              const chunkText = text.slice(start, end);
              const chunkImages = filterReferencedImages(chunkText, allImages);
              return chunkImages.length <= maxImageCount;
            });
            if (allChunksFit) break;
            preSplitCount++;
          }
          logger.info(
            `事前分割（画像数調整）: ドキュメント "${inputData.document.name}" の抽出画像数(${allImages.length})を考慮 → ${preSplitCount}分割`,
          );
        }
      }

      if (preSplitCount > 1) {
        // 分割上限でキャップ（早期終了チェックとの閾値差によるエッジケース防止）
        preSplitCount = Math.min(preSplitCount, MAX_SPLIT_COUNT);

        // 事前分割が必要
        if (documentTokens > availableTokens) {
          logger.info(
            `事前分割: ドキュメント "${inputData.document.name}" のトークン数(${documentTokens})が利用可能トークン数(${availableTokens})を超過 → ${preSplitCount}分割`,
          );
        }

        const text = inputData.document.textContent;
        const ranges = makeChunksByCount(text, preSplitCount, OVERLAP_CHARS);
        const chunks = ranges.map(({ start, end }) => text.slice(start, end));
        const allImages = inputData.document.extractedImages || [];

        return {
          originalDocument: inputData.document,
          reviewInput: chunks.map((chunk, index) => {
            const chunkImages = filterReferencedImages(chunk, allImages);
            return {
              ...inputData,
              document: {
                ...inputData.document,
                id: `${inputData.document.id}_part${index + 1}`,
                name: `${inputData.document.name} (part ${index + 1}) (split into parts because the full content did not fit into context)`,
                originalName:
                  inputData.document.originalName || inputData.document.name,
                textContent: chunk,
                extractedImages:
                  chunkImages.length > 0 ? chunkImages : undefined,
                totalChunks: preSplitCount,
                chunkIndex: index,
              },
            };
          }),
          retryCount: preSplitCount - 1,
          finishReason: 'error' as const,
        } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
      }
    }

    // 分割不要な場合は従来通り
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
            reviewInput: initData.reviewInput,
            retryCount: nextRetryCount,
            status: isFailed
              ? ('failed' as stepStatus)
              : ('success' as stepStatus),
            errorMessage,
            finishReason: isFailed ? ('error' as const) : ('success' as const),
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // リトライ回数が5回を超えたら終了（分割上限到達）
        if (initData.retryCount >= 5) {
          // エラーをDBに保存
          const originalName =
            initData.originalDocument.originalName ||
            initData.originalDocument.name;
          const errorMsg =
            'ドキュメント分割を複数回実行しましたが、コンテキスト長エラーが解消されませんでした';
          await saveChecklistErrors(
            initData.reviewInput[0]?.checklists || [],
            errorMsg,
            originalName,
          );
          return {
            originalDocument: initData.originalDocument,
            reviewInput: initData.reviewInput,
            retryCount: nextRetryCount,
            status: 'failed' as stepStatus,
            errorMessage: `${originalName}: ${errorMsg}`,
            finishReason: 'error' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        }

        // ドキュメント分割処理を実行
        // 分割方針は、originalDocumentを単純に${nextRetryCount + 1}に分割し、テキストドキュメントであればオーバーラップを300文字、PDF画像ドキュメントであれば3画像分オーバーラップさせる
        const splitCount = nextRetryCount + 1;

        if (initData.originalDocument.textContent) {
          // --- テキストドキュメント ---
          const text = initData.originalDocument.textContent;

          const ranges = makeChunksByCount(text, splitCount, OVERLAP_CHARS);

          const chunks = ranges.map(({ start, end }) => text.slice(start, end));

          // 元ドキュメントの画像データ
          const allImages = initData.originalDocument.extractedImages || [];

          return {
            originalDocument: initData.originalDocument,
            reviewInput: chunks.map((chunk, index) => {
              // チャンク内のテキストに含まれる画像リンクのみを紐づけ
              const chunkImages = filterReferencedImages(chunk, allImages);
              return {
                ...initData.reviewInput[0],
                document: {
                  ...initData.originalDocument,
                  id: `${initData.originalDocument.id}_part${index + 1}`,
                  name: `${initData.originalDocument.name} (part ${index + 1}) (split into parts because the full content did not fit into context)`,
                  originalName:
                    initData.originalDocument.originalName ||
                    initData.originalDocument.name,
                  textContent: chunk,
                  extractedImages:
                    chunkImages.length > 0 ? chunkImages : undefined,
                  totalChunks: splitCount,
                  chunkIndex: index,
                },
              };
            }),
            retryCount: nextRetryCount,
            status: 'success' as stepStatus,
            finishReason: 'content_length' as const,
          } as z.infer<typeof individualDocumentReviewRetryWorkflowInputSchema>;
        } else if (initData.originalDocument.imageData) {
          // --- PDF画像（ページ配列想定）---
          const imageData = initData.originalDocument.imageData;

          const ranges = makeChunksByCount(
            imageData,
            splitCount,
            OVERLAP_PAGES,
          );

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
                originalName:
                  initData.originalDocument.originalName ||
                  initData.originalDocument.name,
                imageData: chunk,
                totalChunks: splitCount,
                chunkIndex: index,
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
      // 失敗時は即座にループ終了
      if (inputData.status === 'failed') return true;
      if (inputData.retryCount >= 6) {
        return true;
      }
      if (inputData.finishReason !== 'content_length') {
        return true;
      }
      return false;
    },
  )
  .map(async ({ inputData, bail }) => {
    // 個別ドキュメントレビューの結果をまとめて返す
    if (inputData.status === 'failed') {
      return {
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      } as z.infer<typeof individualDocumentReviewWorkflowOutputSchema>;
    }

    try {
      // 個別レビュー結果を保存
      const reviewRepository = getReviewRepository();
      for (const result of inputData.reviewResults || []) {
        const targetDocument = inputData.reviewInput.find((input) => {
          return result.documentId === input.document.id;
        })?.document;
        if (!targetDocument) {
          logger.warn(
            `Could not find target document for review result: documentId=${result.documentId}, checklistId=${result.checklistId}`,
          );
          continue;
        }
        await reviewRepository.createReviewLargedocumentResultCache({
          reviewDocumentCacheId: inputData.originalDocument.cacheId!,
          reviewChecklistId: result.checklistId,
          comment: result.comment,
          totalChunks: targetDocument.totalChunks ?? 1,
          chunkIndex: targetDocument.chunkIndex ?? 0,
          individualFileName: targetDocument.name,
        });
      }

      return {
        status: 'success' as stepStatus,
        documentsWithReviewResults: inputData.reviewInput.map((input) => {
          const reviewResult = inputData.reviewResults?.filter(
            (result) => result.documentId === input.document.id,
          );
          return {
            ...input.document,
            originalName: input.document.originalName || input.document.name,
            reviewResults: reviewResult || [],
          };
        }),
      } as z.infer<typeof individualDocumentReviewWorkflowOutputSchema>;
    } catch (error) {
      const normalizedError = normalizeUnknownError(error);
      logError(error, '個別ドキュメントレビュー結果保存処理に失敗しました');
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
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
  .map(async ({ inputData, bail }) => {
    // 各ドキュメントに対する個別レビューのタスクを作成
    const tasks = inputData.documents.map(
      (document) =>
        ({
          reviewHistoryId: inputData.reviewHistoryId,
          document: {
            ...document,
            originalName: document.name, // 分割された場合に元の名前を保持するため
            totalChunks: 1,
            chunkIndex: 0,
          },
          checklists: inputData.checklists,
          additionalInstructions: inputData.additionalInstructions,
          commentFormat: inputData.commentFormat,
          evaluationSettings: inputData.evaluationSettings,
        }) as z.infer<typeof individualDocumentReviewStep.inputSchema>,
    );

    // 事前トークンチェック: テキストドキュメントのトークン数がコンテキスト長×分割上限を超えていないか確認
    try {
      const tokenizer = getTokenizer();
      const settingsRepository = getSettingsRepository();
      const settings = await settingsRepository.getSettings();
      const modelName = settings.api.model;
      const maxContextLength = getModelMaxContextLength(modelName);
      // 分割上限を考慮した最大許容トークン数（バッファ付き）
      const maxAllowableTokens = Math.floor(
        maxContextLength * MAX_SPLIT_COUNT * (1 - EARLY_TERMINATION_BUFFER),
      );

      for (const task of tasks) {
        if (task.document.textContent) {
          const documentTokens = tokenizer.countTokens(
            task.document.textContent,
          );
          if (documentTokens > maxAllowableTokens) {
            const errorMsg = `ドキュメント "${task.document.name}" のトークン数(${documentTokens.toLocaleString()})がドキュメント分割上限を考慮した上でのレビュー可能なトークン数(${maxAllowableTokens.toLocaleString()})を超えているため、レビューを実行できません`;
            logger.warn(`早期終了: ${errorMsg}`);
            // 全チェックリストにエラーを保存
            await saveChecklistErrors(inputData.checklists, errorMsg);
            return bail({
              status: 'failed' as stepStatus,
              errorMessage: errorMsg,
            });
          }
        }
      }

      // 画像数チェック
      const maxImageCount = getModelMaxImageCount(modelName);
      const maxAllowableImages = maxImageCount * MAX_SPLIT_COUNT;

      for (const task of tasks) {
        const doc = task.document;

        // (A) 画像変換モードの場合
        if (doc.processMode === 'image' && doc.imageData) {
          if (doc.imageData.length > maxAllowableImages) {
            const errorMsg = `ドキュメント "${doc.name}" の画像数(${doc.imageData.length})がドキュメント分割上限を考慮した上でのレビュー可能な画像数(${maxAllowableImages})を超えているため、レビューを実行できません`;
            logger.warn(`早期終了（画像数超過）: ${errorMsg}`);
            await saveChecklistErrors(inputData.checklists, errorMsg);
            return bail({
              status: 'failed' as stepStatus,
              errorMessage: errorMsg,
            });
          }
        }

        // (B) テキスト抽出 + リッチ戦略成功 + 画像含むの場合
        if (
          doc.processMode === 'text' &&
          isRichFormatType(doc.formatType) &&
          doc.includeImages
        ) {
          const extractedImageCount = doc.extractedImages?.length ?? 0;

          // (B-1) 画像数が分割上限×最大画像数を超える → 即時終了
          if (extractedImageCount > maxAllowableImages) {
            const errorMsg = `ドキュメント "${doc.name}" の抽出画像数(${extractedImageCount})がドキュメント分割上限を考慮した上でのレビュー可能な画像数(${maxAllowableImages})を超えているため、レビューを実行できません`;
            logger.warn(`早期終了（抽出画像数超過）: ${errorMsg}`);
            await saveChecklistErrors(inputData.checklists, errorMsg);
            return bail({
              status: 'failed' as stepStatus,
              errorMessage: errorMsg,
            });
          }

          // (B-2) 画像数が最大画像数を超える場合 → 分割シミュレーションで各チャンクの画像数を確認
          if (
            extractedImageCount > maxImageCount &&
            doc.textContent &&
            doc.extractedImages
          ) {
            const text = doc.textContent;
            const ranges = makeChunksByCount(
              text,
              MAX_SPLIT_COUNT,
              OVERLAP_CHARS,
            );
            const allImages = doc.extractedImages;
            let hasOversizedChunk = false;
            for (const { start, end } of ranges) {
              const chunkText = text.slice(start, end);
              const chunkImages = filterReferencedImages(chunkText, allImages);
              if (chunkImages.length > maxImageCount) {
                hasOversizedChunk = true;
                break;
              }
            }
            if (hasOversizedChunk) {
              const errorMsg = `ドキュメント "${doc.name}" の抽出画像数(${extractedImageCount})が多く、最大分割数(${MAX_SPLIT_COUNT})で分割しても1チャンクあたりの画像数がモデルの上限(${maxImageCount})を超えるため、レビューを実行できません`;
              logger.warn(`早期終了（分割後画像数超過）: ${errorMsg}`);
              await saveChecklistErrors(inputData.checklists, errorMsg);
              return bail({
                status: 'failed' as stepStatus,
                errorMessage: errorMsg,
              });
            }
          }
        }
      }
    } catch (error) {
      // トークンチェック自体の失敗はワークフローを止めない（後続のAI実行で検出される）
      logError(
        error,
        '事前トークンチェック中にエラーが発生しましたが、処理を継続します',
      );
    }

    return tasks;
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
      // 全チェックリストにエラーを保存
      await saveChecklistErrors(initData.checklists, errorMessage);
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
