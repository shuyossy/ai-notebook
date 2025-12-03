// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../types';
import { baseStepOutputSchema } from '../../schema';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import FileExtractor from '@/main/lib/fileExtractor';
import { getMainLogger } from '@/main/lib/logger';
import { extractedDocumentSchema, uploadedFileSchema } from './schema';
import { getReviewRepository } from '@/adapter/db';

const logger = getMainLogger();

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
        const cachedDocuments = await repository.getReviewDocumentCaches(
          reviewHistoryId,
        );

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
          });
        }

        return {
          status: 'success' as stepStatus,
          extractedDocuments,
        };
      }

      // 初回レビュー: ファイルからテキスト抽出
      // 各ファイルからテキストを抽出
      for (const file of files) {
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
          // テキスト抽出処理
          const { content } = await FileExtractor.extractText(file.path);

          extractedDocuments.push({
            id,
            name: file.name,
            path: file.path,
            type: file.type,
            textContent: content,
            processMode: file.processMode as 'text' | 'image' | undefined,
            imageMode: file.imageMode as 'merged' | 'pages' | undefined,
            imageData: undefined,
          });
        }
      }

      return {
        status: 'success' as stepStatus,
        extractedDocuments,
      };
    } catch (error) {
      logger.error(error, 'テキスト抽出処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);

      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});
