// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
import { stepStatus } from '../../types';
import { logError } from '@/main/lib/logger';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { ReviewChatResearchAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import {
  createRuntimeContext,
  judgeFinishReason,
  judgeErrorIsContentLengthError,
  getModelSpecificGenerateOptions,
} from '@/mastra/lib/agentUtils';
import { withAIControl } from '@/mastra/lib/withAIControl';
import { getReviewRepository } from '@/adapter/db';
import { judgeReviewMode, buildResearchChecklistInfo } from '../lib';
import { buildDocumentFormatContext } from '@/mastra/lib/extractionFormatDescription';

export const researchChunkStepInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentCacheId: z.number(),
  researchContent: z.string(),
  chunkContent: z.object({
    text: z.string().optional(),
    images: z.array(z.string()).optional(),
    extractedImages: z
      .array(
        z.object({
          referenceId: z.string(),
          base64Data: z.string(),
          mimeType: z.string(),
        }),
      )
      .optional(),
  }),
  chunkIndex: z.number(),
  totalChunks: z.number(),
  fileName: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
  reasoning: z.string(),
});

const researchChunkStepOutputSchema = baseStepOutputSchema.extend({
  chunkResult: z.string().optional(),
  chunkIndex: z.number().optional(),
  finishReason: z.enum(['success', 'error', 'content_length']).optional(),
});

export const researchChunkStep = createStep({
  id: 'researchChunkStep',
  description: 'チャンク単位でドキュメントを調査するステップ',
  inputSchema: researchChunkStepInputSchema,
  outputSchema: researchChunkStepOutputSchema,
  execute: async ({ inputData, bail, mastra, getInitData }) => {
    try {
      const {
        researchContent,
        chunkContent,
        chunkIndex,
        totalChunks,
        fileName,
        reviewHistoryId,
        documentCacheId,
        checklistIds,
        question,
        reasoning,
      } = inputData;

      // チェックリスト情報を生成（ヘルパー関数を利用）
      const reviewRepository = getReviewRepository();
      const checklistResults =
        await reviewRepository.getChecklistResultsWithIndividualResults(
          reviewHistoryId,
          checklistIds,
        );

      // レビューモードを判定（ヘルパー関数を利用）
      const reviewMode = judgeReviewMode(checklistResults);

      // チェックリスト情報の文字列を生成（ヘルパー関数を利用）
      const checklistInfo = buildResearchChecklistInfo(checklistResults);

      // RuntimeContext作成
      const runtimeContext =
        await createRuntimeContext<ReviewChatResearchAgentRuntimeContext>();
      runtimeContext.set('researchContent', researchContent);
      runtimeContext.set('totalChunks', totalChunks);
      runtimeContext.set('chunkIndex', chunkIndex);
      runtimeContext.set('fileName', fileName);
      runtimeContext.set('checklistInfo', checklistInfo);
      runtimeContext.set('userQuestion', question);
      runtimeContext.set('reasoning', reasoning);
      runtimeContext.set('reviewMode', reviewMode);

      // ドキュメントキャッシュからフォーマット情報を取得してコンテキストを設定
      const documentCache =
        await reviewRepository.getReviewDocumentCacheById(documentCacheId);
      if (documentCache) {
        // includeImagesはこのチャンクに実際にextractedImagesがあるかどうかで判定
        const hasExtractedImages = !!(
          chunkContent?.extractedImages &&
          chunkContent.extractedImages.length > 0
        );
        const documentFormatContext = buildDocumentFormatContext([
          {
            name: documentCache.fileName,
            formatType: documentCache.formatType ?? undefined,
            processMode: documentCache.processMode,
            includeImages: hasExtractedImages,
          },
        ]);
        if (documentFormatContext) {
          runtimeContext.set('documentFormatContext', documentFormatContext);
        }
      }

      // メッセージを作成
      const messageContent: (
        | { type: 'text'; text: string }
        | { type: 'image'; image: string; mimeType: string }
      )[] = [];

      if (chunkContent.text) {
        // テキストチャンクの場合
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${fileName}\n\nResearch Instructions: ${researchContent}\n\nDocument Content:\n${chunkContent.text}`,
        });
        // テキスト抽出時の画像がある場合は参照IDラベル付きで追加
        if (
          chunkContent.extractedImages &&
          chunkContent.extractedImages.length > 0
        ) {
          for (const img of chunkContent.extractedImages) {
            messageContent.push({
              type: 'text' as const,
              text: `[Image: ${img.referenceId}]`,
            });
            messageContent.push({
              type: 'image' as const,
              image: img.base64Data,
              mimeType: img.mimeType,
            });
          }
        }
      } else if (chunkContent.images && chunkContent.images.length > 0) {
        // 画像チャンクの場合
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${fileName}\n\nResearch Instructions: ${researchContent}\n\nPlease analyze the following document images:`,
        });

        chunkContent.images.forEach((imageBase64) => {
          messageContent.push({
            type: 'image' as const,
            image: imageBase64,
            mimeType: 'image/png',
          });
        });
      }

      // Mastraエージェント経由でAI呼び出し
      const researchAgent = mastra.getAgent('reviewChatResearchAgent');
      const result = await withAIControl(() =>
        researchAgent.generateLegacy(
          {
            role: 'user',
            content: messageContent,
          },
          {
            runtimeContext,
            maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
            ...getModelSpecificGenerateOptions(runtimeContext),
          },
        ),
      );

      const { success, reason } = judgeFinishReason(result.finishReason);

      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      return {
        status: 'success' as stepStatus,
        chunkIndex,
        chunkResult: result.text,
        finishReason: 'success' as const,
      };
    } catch (error) {
      // コンテキスト長エラーの場合は特別な処理
      if (judgeErrorIsContentLengthError(error)) {
        return {
          status: 'success' as stepStatus,
          chunkIndex: inputData.chunkIndex,
          finishReason: 'content_length' as const,
        };
      }

      logError(error, 'チャンク調査に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
        finishReason: 'error' as const,
      });
    }
  },
});
