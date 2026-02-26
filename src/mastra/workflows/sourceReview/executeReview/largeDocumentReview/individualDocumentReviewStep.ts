// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../../schema';
import { stepStatus } from '../../../types';
import type { IndividualDocumentReviewAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { normalizeUnknownError } from '@/main/lib/error';
import { internalError } from '@/main/lib/error';
import {
  createRuntimeContext,
  judgeErrorIsContentLengthError,
  judgeFinishReason,
  getModelSpecificGenerateOptions,
} from '@/mastra/lib/agentUtils';
import { logError } from '@/main/lib/logger';
import { createCombinedMessageFromExtractedDocument } from '../../lib';
import { getChecklistsErrorMessage, saveChecklistErrors } from '../lib';
import { extractedDocumentSchema } from '../schema';
import { getReviewRepository } from '@/adapter/db';
import { buildDocumentFormatContext } from '@/mastra/lib/extractionFormatDescription';

// 個別ドキュメントレビューステップの入力スキーマ
export const individualDocumentReviewStepInputSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  document: extractedDocumentSchema.extend({
    originalName: z.string(),
    totalChunks: z.number().optional(), // ドキュメント分割総数
    chunkIndex: z.number().optional(), // 何番目のチャンクか（0から始まる）
  }),
  // チェックリスト
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
  additionalInstructions: z
    .string()
    .optional()
    .describe('レビューに対する追加指示'),
  commentFormat: z
    .string()
    .optional()
    .describe('レビューコメントのフォーマット'),
});

// 個別ドキュメントレビューステップの出力スキーマ
export const individualDocumentReviewStepOutputSchema =
  baseStepOutputSchema.extend({
    reviewResults: z
      .array(
        z.object({
          documentId: z.string().optional(),
          checklistId: z.number(),
          comment: z.string().describe('evaluation comment'),
        }),
      )
      .optional(),
    finishReason: z.enum(['success', 'error', 'content_length']),
  });

/**
 * 個別ドキュメントレビューステップ
 * 1つのドキュメントに対してチェックリストベースのレビューを実行
 */
export const individualDocumentReviewStep = createStep({
  id: 'individualDocumentReviewStep',
  description: '個別ドキュメントに対するレビュー実行ステップ',
  inputSchema: individualDocumentReviewStepInputSchema,
  outputSchema: individualDocumentReviewStepOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    const { document, checklists, additionalInstructions, commentFormat } =
      inputData;

    // catchブロックからアクセスできるようにtryの外で宣言
    let targetChecklists = checklists;
    const allReviewResults: Array<{
      documentId: string;
      checklistId: number;
      comment: string;
    }> = [];

    try {
      const reviewAgent = mastra.getAgent('individualDocumentReviewAgent');

      // ドキュメント内容を構築
      const message = createCombinedMessageFromExtractedDocument(
        [document],
        'Please review this document against the provided checklist items',
      );

      // レビューメッセージを構築
      const reviewMessage = {
        ...message,
        content: [
          ...message.content,
          {
            type: 'text' as const,
            text: `Document Information:
- Original File Name: ${document.originalName}
- Current Document Name: ${document.name}
${document.name !== document.originalName ? '- Note: This is a part of the original document that was split due to length constraints' : ''}

Checklist Items to Review:\n${checklists.map((item) => `- ID: ${item.id} - ${item.content}`).join('\n')}\n\nPlease provide a thorough review based on the document content provided above.`,
          },
        ],
      };

      // レビューを実行（最大3回まで再試行）
      const maxAttempts = 3;
      let attempt = 0;

      while (attempt < maxAttempts && targetChecklists.length > 0) {
        const outputSchema = z.array(
          z.object({
            // CoTのようにAIにどのファイルのどのセクションをレビューするべきかを考えさせるための隠しフィールド
            reviewSections: z
              .array(z.string().describe('section name within the file'))
              .describe(
                'sections that should be reviewed for evaluation and commenting',
              ),
            checklistId: z.number().describe('checklist id'),
            comment: z.string().describe('evaluation comment'),
          }),
        );

        const runtimeContext =
          await createRuntimeContext<IndividualDocumentReviewAgentRuntimeContext>();
        runtimeContext.set('checklistItems', targetChecklists);
        runtimeContext.set('additionalInstructions', additionalInstructions);
        runtimeContext.set('commentFormat', commentFormat);

        // ドキュメントフォーマットコンテキストを設定
        const documentFormatContext = buildDocumentFormatContext([
          {
            name: document.name,
            formatType: document.formatType,
            processMode: document.processMode || 'text',
            includeImages: document.includeImages ?? false,
          },
        ]);
        if (documentFormatContext) {
          runtimeContext.set('documentFormatContext', documentFormatContext);
        }

        // レビューエージェントを使用してレビューを実行
        const reviewResult = await reviewAgent.generateLegacy(reviewMessage, {
          output: outputSchema,
          runtimeContext,
          abortSignal,
          maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
          ...getModelSpecificGenerateOptions(runtimeContext),
        });

        if (reviewResult.finishReason === 'length') {
          return bail({
            status: 'failed' as stepStatus,
            errorMessage: getChecklistsErrorMessage(
              targetChecklists,
              'ドキュメントの内容が長すぎてAIが処理できませんでした',
            ),
            finishReason: 'content_length',
          });
        }

        const { success, reason } = judgeFinishReason(
          reviewResult.finishReason,
        );
        if (!success) {
          throw internalError({
            expose: true,
            messageCode: 'AI_API_ERROR',
            messageParams: { detail: reason },
          });
        }

        allReviewResults.push(
          ...reviewResult.object.map((result) => ({
            documentId: document.id,
            checklistId: result.checklistId,
            comment: result.comment,
          })),
        );

        // レビュー結果に含まれなかったチェックリストを抽出
        const reviewedChecklistIds = new Set(
          reviewResult.object && Array.isArray(reviewResult.object)
            ? reviewResult.object.map((result) => result.checklistId)
            : [],
        );
        targetChecklists = targetChecklists.filter(
          (checklist) => !reviewedChecklistIds.has(checklist.id),
        );

        if (targetChecklists.length === 0) {
          // 全てのチェックリストがレビューされた場合、成功
          break;
        }
        attempt += 1;
      }

      if (attempt >= maxAttempts && targetChecklists.length > 0) {
        // 最大試行回数に達した場合、エラーをDBに保存
        await saveChecklistErrors(
          targetChecklists,
          'AIの出力にレビュー結果が含まれませんでした',
          document.originalName,
        );
      }

      // 成功（部分的にエラーがあってもDB保存済み）
      return {
        status: 'success' as stepStatus,
        reviewResults: allReviewResults,
        finishReason: 'success',
      };
    } catch (error) {
      const isContentLengthError = judgeErrorIsContentLengthError(error);
      logError(error, '個別ドキュメントレビュー処理に失敗しました', {
        documentOriginalName: document.originalName,
        documentName: document.name,
        totalChunks: document.totalChunks,
        chunkIndex: document.chunkIndex,
      });
      const normalizedError = normalizeUnknownError(error);
      const errorMessage = normalizedError.message;

      if (isContentLengthError) {
        // コンテキスト長エラーの場合はリトライ用にそのまま返す
        return {
          status: 'failed' as stepStatus,
          errorMessage: `${checklists?.map((c) => `・${c.content}:${errorMessage}`).join('\n')}`,
          finishReason: 'content_length' as const,
        };
      }

      // DB保存エラーはインフラエラーのため、従来通りワークフローを失敗させる
      if (normalizedError.messageCode === 'DATA_ACCESS_ERROR') {
        return {
          status: 'failed' as stepStatus,
          errorMessage,
          finishReason: 'error' as const,
        };
      }
      // コンテキスト長エラー以外はエラーをDBに保存してステップは成功として返す
      await saveChecklistErrors(
        targetChecklists,
        errorMessage,
        document.originalName,
      );
      return {
        status: 'success' as stepStatus,
        reviewResults: allReviewResults,
        finishReason: 'success',
      };
    }
  },
});
