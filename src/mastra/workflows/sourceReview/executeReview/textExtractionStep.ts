// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../types';
import { baseStepOutputSchema } from '../../schema';
import { normalizeUnknownError } from '@/main/lib/error';
import FileExtractor from '@/main/lib/fileExtractor';
import { getMainLogger } from '@/main/lib/logger';
import { extractedDocumentSchema, uploadedFileSchema } from './schema';

const logger = getMainLogger();

// 入力スキーマ
export const textExtractionInputSchema = z.object({
  files: z.array(uploadedFileSchema).describe('アップロードファイルのリスト'),
});

// テキスト抽出ステップの出力スキーマ
export const textExtractionOutputSchema = baseStepOutputSchema.extend({
  extractedDocuments: z.array(extractedDocumentSchema.optional()),
});

export const textExtractionStep = createStep({
  id: 'textExtractionStep',
  description:
    'ドキュメントからテキストを抽出し、ワークフロー用のIDを付与するステップ',
  inputSchema: textExtractionInputSchema,
  outputSchema: textExtractionOutputSchema,
  execute: async ({ inputData, abortSignal, bail }) => {
    const { files } = inputData;
    const fileIdSequence = (function* () {
      let id = 1;
      while (true) {
        yield id++;
      }
    })();

    try {
      const extractedDocuments = [];

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
            imageMode: file.imageMode,
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
            processMode: file.processMode,
            imageMode: file.imageMode,
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
