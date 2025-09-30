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
} from '@/mastra/lib/agentUtils';
import { getMainLogger } from '@/main/lib/logger';
import { createCombinedMessageFromExtractedDocument } from '../../lib';
import { getChecklistsErrorMessage } from '../lib';


const logger = getMainLogger();

// 個別ドキュメントレビューステップの入力スキーマ
export const individualDocumentReviewStepInputSchema = z.object({
  document: z.object({
    id: z.string(),
    originalName: z.string(),
    name: z.string(),
    path: z.string(),
    type: z.string(),
    pdfProcessMode: z.enum(['text', 'image']).optional(),
    pdfImageMode: z.enum(['merged', 'pages']).optional(),
    textContent: z.string().optional(),
    imageData: z.array(z.string()).optional(),
  }),
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

    try {
      const reviewAgent = mastra.getAgent('individualDocumentReviewAgent');

      // ドキュメント内容を構築
      const message = await createCombinedMessageFromExtractedDocument(
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
      let targetChecklists = checklists;
      const allReviewResults: Array<{
        checklistId: number;
        comment: string;
      }> = [];

      while (attempt < maxAttempts && targetChecklists.length > 0) {
        const outputSchema = z.array(
          z.object({
            // CoTのようにAIにどのファイルのどのセクションをレビューするべきかを考えさせるための隠しフィールド
            reviewSections: z
              .array(
                z.object({
                  fileName: z.string().describe('file name to review'),
                  sectionNames: z.array(
                    z.string().describe('section name within the file'),
                  ),
                }),
              )
              .describe(
                'files and sections that should be reviewed for evaluation and commenting',
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

        // レビューエージェントを使用してレビューを実行
        const reviewResult = await reviewAgent.generate(reviewMessage, {
          output: outputSchema,
          runtimeContext,
          abortSignal,
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
        // 最大試行回数に達した場合、失敗したチェックリストを記録
        return {
          status: 'failed' as stepStatus,
          errorMessage: getChecklistsErrorMessage(
            targetChecklists,
            'AIの出力にレビュー結果が含まれませんでした',
          ),
        };
      }

      // 全てのレビューが成功した場合
      return {
        status: 'success' as stepStatus,
        documentId: document.id,
        reviewResults: allReviewResults,
        finishReason: 'success',
      };
    } catch (error) {
      const isContentLengthError = judgeErrorIsContentLengthError(error);
      logger.error(error, '個別ドキュメントレビュー処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      const errorMessage = normalizedError.message;
      // エラーが発生した場合はエラー情報を返す
      return {
        status: 'failed' as stepStatus,
        errorMessage: `${checklists?.map((c) => `・${c.content}:${errorMessage}`).join('\n')}`,
        finishReason: isContentLengthError ? 'content_length' : 'error',
      };
    }
  },
});
