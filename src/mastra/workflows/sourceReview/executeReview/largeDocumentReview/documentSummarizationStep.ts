// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../../schema';
import { stepStatus } from '../../../types';
import { createCombinedMessage } from '../../lib';
import {
  createRuntimeContext,
  judgeFinishReason,
} from '@/mastra/lib/agentUtils';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';
import { getChecklistsErrorMessage } from '../lib';

const logger = getMainLogger();

export const documentSummarizationInputSchema = z
  .object({
    documents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        path: z.string(),
        type: z.string(),
        pdfProcessMode: z.enum(['text', 'image']).optional(),
        pdfImageMode: z.enum(['merged', 'pages']).optional(),
        textContent: z.string().optional(),
        imageData: z.array(z.string()).optional(),
      }),
    ),
    checklists: z.array(
      z.object({
        id: z.number(),
        content: z.string(),
      }),
    ),
  })
  .describe('要約生成対象のドキュメント');

const documentSummarizationOutputSchema = baseStepOutputSchema
  .extend({
    documents: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          path: z.string(),
          type: z.string(),
          pdfProcessMode: z.enum(['text', 'image']).optional(),
          pdfImageMode: z.enum(['merged', 'pages']).optional(),
          textContent: z.string().optional(),
          imageData: z.array(z.string()).optional(),
          topicAndSummary: z.array(
            z.object({
              topic: z.string().describe('ドキュメントから抽出されたトピック'),
              summary: z
                .string()
                .describe('そのトピックに関するドキュメントの要約'),
            }),
          ),
        }),
      )
      .optional(),
  })
  .describe('各ドキュメントのトピックと要約のリスト');

export const documentSummarizationStep = createStep({
  id: 'documentSummarizationStep',
  description: '個々のドキュメントのトピックと要約を生成するステップ',
  inputSchema: documentSummarizationInputSchema,
  outputSchema: documentSummarizationOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    const { documents, checklists } = inputData;

    try {
      // ドキュメントが空の場合、エラーで終了
      if (documents.length === 0) {
        throw internalError({
          expose: false,
          messageCode: 'PLAIN_MESSAGE',
          messageParams: { message: 'ドキュメントが空です' },
        });
      }
      const resultDocuments = [];

      // 各ドキュメントに対して要約とトピック抽出を実行
      for (const doc of documents) {
        // ユーザプロンプト
        const message = await createCombinedMessage(
          [doc],
          'Please summarize the document and extract key topics and summaries.',
        );

        // 要約生成エージェントを取得
        const agent = mastra.getAgent('reviewDocumentSummarizationAgent');

        // 出力スキーマを定義
        const outputSchema = z.object({
          topicAndSummaryList: z.array(
            z.object({
              topic: z.string().describe('Topics extracted from the document'),
              summary: z
                .string()
                .describe('Summary of the document on the topic'),
            }),
          ),
        });

        const result = await agent.generate(message, {
          output: outputSchema,
          abortSignal,
          runtimeContext: await createRuntimeContext(),
        });

        const { success, reason } = judgeFinishReason(result.finishReason);
        if (!success) {
          throw internalError({
            expose: true,
            messageCode: 'AI_API_ERROR',
            messageParams: { detail: reason },
          });
        }

        resultDocuments.push({
          id: doc.id,
          name: doc.name,
          path: doc.path,
          type: doc.type,
          pdfProcessMode: doc.pdfProcessMode,
          pdfImageMode: doc.pdfImageMode,
          textContent: doc.textContent,
          imageData: doc.imageData,
          topicAndSummary: result.object.topicAndSummaryList,
        });
      }

      return {
        status: 'success' as stepStatus,
        documents: resultDocuments,
      };
    } catch (error) {
      logger.error(error, 'ドキュメント要約生成処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);

      return bail({
        status: 'failed' as stepStatus,
        errorMessage: getChecklistsErrorMessage(checklists, normalizedError.message),
      });
    }
  },
});
