// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../types';
import { baseStepOutputSchema } from '../../schema';
import { normalizeUnknownError } from '@/main/lib/error';
import FileExtractor from '@/main/lib/fileExtractor';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

// 入力スキーマ
export const textExtractionInputSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string(),
        path: z.string(),
        type: z.string(),
        pdfProcessMode: z.enum(['text', 'image']).optional(),
        pdfImageMode: z.enum(['merged', 'pages']).optional(),
        imageData: z.array(z.string()).optional(),
      }),
    )
    .describe('アップロードファイルのリスト'),
});

// テキスト抽出ステップの出力スキーマ
export const textExtractionOutputSchema = baseStepOutputSchema.extend({
  extractedDocuments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      type: z.string(),
      pdfProcessMode: z.enum(['text', 'image']).optional(),
      pdfImageMode: z.enum(['merged', 'pages']).optional(),
      textContent: z.string().optional(),
      imageData: z.array(z.string()).optional(),
    })
  ).optional(),
});

export const textExtractionStep = createStep({
  id: 'textExtractionStep',
  description: 'ドキュメントからテキストを抽出し、ワークフロー用のIDを付与するステップ',
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
          file.type === 'application/pdf' &&
          file.pdfProcessMode === 'image' &&
          file.imageData &&
          file.imageData.length > 0
        ) {
          // 画像データはそのまま保持、テキストは空文字
          extractedDocuments.push({
            id,
            name: file.name,
            path: file.path,
            type: file.type,
            pdfProcessMode: file.pdfProcessMode,
            pdfImageMode: file.pdfImageMode,
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
            pdfProcessMode: file.pdfProcessMode,
            pdfImageMode: file.pdfImageMode,
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
