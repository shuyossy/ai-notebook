// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../types';
import { baseStepOutputSchema } from '../../schema';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { FileTextExtractor } from '@/main/lib/textExtractor/FileTextExtractor';
import { logError } from '@/main/lib/logger';
import { extractedDocumentSchema, uploadedFileSchema } from './schema';
import { removeImageLinks } from '@/mastra/lib/util';
import { getReviewRepository } from '@/adapter/db';
import { publishEvent } from '@/main/lib/eventPayloadHelper';
import { IpcChannels } from '@/types';

// 入力スキーマ
export const textExtractionInputSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  files: z
    .array(uploadedFileSchema)
    .optional()
    .describe('アップロードファイルのリスト（リトライ時はオプション）'),
});

// テキスト抽出ステップの出力スキーマ
export const textExtractionOutputSchema = baseStepOutputSchema.extend({
  extractedDocuments: z.array(extractedDocumentSchema.optional()),
});

export const textExtractionStep = createStep({
  id: 'textExtractionStep',
  description: 'ドキュメントからテキストを抽出するステップ',
  inputSchema: textExtractionInputSchema,
  outputSchema: textExtractionOutputSchema,
  execute: async ({ inputData, abortSignal, bail }) => {
    const { reviewHistoryId, files } = inputData;
    const fileIdSequence = (function* () {
      let id = 1;
      while (true) {
        yield id++;
      }
    })();

    try {
      const extractedDocuments: z.infer<typeof extractedDocumentSchema>[] = [];

      // リトライの場合: キャッシュからロード
      if (!files) {
        const repository = getReviewRepository();
        const cachedDocuments =
          await repository.getReviewDocumentCaches(reviewHistoryId);

        if (cachedDocuments.length === 0) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_DOCUMENT_CACHE_NOT_FOUND',
            messageParams: { reviewHistoryId },
          });
        }

        // キャッシュからextractedDocuments形式に変換
        for (const cache of cachedDocuments) {
          const id = fileIdSequence.next().value.toString();

          extractedDocuments.push({
            id,
            name: cache.fileName,
            path: '', // キャッシュからロードした場合はpathは不要
            type: '', // キャッシュからロードした場合はtypeは不要
            processMode: cache.processMode,
            textContent: cache.textContent,
            imageData: cache.imageData,
            imageMode: undefined, // キャッシュにはimageModeが保存されていない
            extractedImages: cache.extractedImages,
            formatType: cache.formatType ?? undefined,
            includeImages: cache.includeImages ?? false,
          });
        }

        return {
          status: 'success' as stepStatus,
          extractedDocuments,
        };
      }

      // 初回レビュー: ファイルからテキスト抽出
      const fileTextExtractor = new FileTextExtractor();

      // 各ファイルからテキストを抽出
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 進捗イベントを発行
        publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
          reviewHistoryId,
          currentFileName: file.name,
          currentFileIndex: i,
          totalFiles: files.length,
          phase: 'processing',
        });

        // ワークフロー内での一意IDを生成
        const id = fileIdSequence.next().value.toString();

        // PDFで画像として処理する場合
        if (
          file.processMode === 'image' &&
          file.imageData &&
          file.imageData.length > 0
        ) {
          // 画像データはそのまま保持、テキストは空文字
          extractedDocuments.push({
            id,
            name: file.name,
            path: file.path,
            type: file.type,
            processMode: file.processMode,
            imageMode: file.imageMode as 'merged' | 'pages' | undefined,
            textContent: undefined,
            imageData: file.imageData,
          });
        } else {
          // FileTextExtractorを使用したテキスト抽出処理
          const result = await fileTextExtractor.extract(file.path, file.name);

          // includeImages=falseの場合は画像リンクを除去し、画像データを除外
          const shouldIncludeImages = file.includeImages === true;
          const textContent = shouldIncludeImages
            ? result.content
            : removeImageLinks(result.content);
          const extractedImages =
            shouldIncludeImages && result.images.length > 0
              ? result.images
              : undefined;

          extractedDocuments.push({
            id,
            name: file.name,
            path: file.path,
            type: file.type,
            textContent,
            processMode: file.processMode as 'text' | 'image' | undefined,
            imageMode: file.imageMode as 'merged' | 'pages' | undefined,
            imageData: undefined,
            extractedImages,
            formatType: result.formatType,
            includeImages: shouldIncludeImages,
          });
        }
      }

      // ファイル処理完了を通知
      publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
        reviewHistoryId,
        currentFileName: '',
        currentFileIndex: files.length,
        totalFiles: files.length,
        phase: 'completed',
      });

      return {
        status: 'success' as stepStatus,
        extractedDocuments,
      };
    } catch (error) {
      logError(error, 'ファイル処理に失敗しました', {
        reviewHistoryId,
        fileNames: files?.map((f) => f.name),
      });
      const normalizedError = normalizeUnknownError(error);

      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});
