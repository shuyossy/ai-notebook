// @ts-ignore
import { createWorkflow, createStep } from '@mastra/core';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { DataStreamWriter } from 'ai';
import { z } from 'zod';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import { getReviewRepository } from '@/adapter/db';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import {
  ReviewChatPlanningAgentRuntimeContext,
  ReviewChatResearchAgentRuntimeContext,
  ReviewChatAnswerAgentRuntimeContext
} from '@/mastra/agents/workflowAgents';
import { createRuntimeContext, judgeFinishReason } from '@/mastra/lib/agentUtils';
import { IpcChannels } from '@/types';
import { publishEvent } from '@/main/lib/eventPayloadHelper';

const logger = getMainLogger();

// ワークフローのラインタイムコンテキスト
export type ReviewChatWorkflowRuntimeContext = {
  dataStreamWriter: DataStreamWriter;
};

// 入力スキーマ
const reviewChatInputSchema = z.object({
  reviewHistoryId: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
});

// Step 1: 調査計画作成
const planResearchStepOutputSchema = baseStepOutputSchema.extend({
  researchTasks: z
    .array(
      z.object({
        documentId: z.string(),
        researchContent: z.string(),
      }),
    )
    .optional(),
});

const planResearchStep = createStep({
  id: 'planResearchStep',
  description: '調査計画を作成するステップ',
  inputSchema: reviewChatInputSchema,
  outputSchema: planResearchStepOutputSchema,
  execute: async ({ inputData, bail, mastra }) => {
    try {
      const { reviewHistoryId, checklistIds, question } = inputData;
      const reviewRepository = getReviewRepository();

      // チェックリスト結果と個別レビュー結果を取得
      const checklistResults =
        await reviewRepository.getChecklistResultsWithIndividualResults(
          reviewHistoryId,
          checklistIds,
        );

      // ドキュメント一覧を取得
      const documentCaches =
        await reviewRepository.getReviewDocumentCaches(reviewHistoryId);

      // RuntimeContext作成
      const availableDocuments = documentCaches.map(doc => ({
        id: doc.documentId,
        fileName: doc.fileName,
      }));

      // チェックリスト情報の文字列を生成
      const checklistInfo = checklistResults
        .map((item) => {
          let info = `Checklist ID: ${item.checklistResult.id}\nContent: ${item.checklistResult.content}\n`;
          if (item.checklistResult.sourceEvaluation) {
            info += `Review Result:\n  Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}\n  Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}\n`;
          }
          if (item.individualResults && item.individualResults.length > 0) {
            info += `Individual Review Results:\n`;
            item.individualResults.forEach((result) => {
              info += `  - Document ID: ${result.documentId}\n    Comment: ${result.comment}\n`;
            });
          }
          return info;
        })
        .join('\n---\n');

      // RuntimeContext作成
      const runtimeContext = await createRuntimeContext<ReviewChatPlanningAgentRuntimeContext>();
      runtimeContext.set('availableDocuments', availableDocuments);
      runtimeContext.set('checklistInfo', checklistInfo);

      // Mastraエージェント経由でAI呼び出し
      const planningAgent = mastra.getAgent('reviewChatPlanningAgent');
      const result = await planningAgent.generate(question, {
        runtimeContext
      });

      const { success, reason } = judgeFinishReason(result.finishReason);
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      // AIの応答から調査タスクを抽出（簡易実装）
      const researchTasks: Array<{ documentId: string; researchContent: string }> = [];

      // 簡易的に全ドキュメントを対象とする
      documentCaches.forEach((doc) => {
        researchTasks.push({
          documentId: doc.documentId,
          researchContent: `Investigate the following question: ${question}\n\nRelevant checklist information:\n${checklistInfo}`,
        });
      });

      return {
        status: 'success' as stepStatus,
        researchTasks,
      };
    } catch (error) {
      logger.error(error, '調査計画の作成に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// Step 2: 個別ドキュメント調査
const researchDocumentStepInputSchema = z.object({
  reviewHistoryId: z.string(),
  documentId: z.string(),
  researchContent: z.string(),
});

const researchDocumentStepOutputSchema = baseStepOutputSchema.extend({
  documentId: z.string().optional(),
  researchResult: z.string().optional(),
});

const researchDocumentStep = createStep({
  id: 'researchDocumentStep',
  description: '個別ドキュメントを調査するステップ',
  inputSchema: researchDocumentStepInputSchema,
  outputSchema: researchDocumentStepOutputSchema,
  execute: async ({ inputData, bail, mastra }) => {
    try {
      const { reviewHistoryId, documentId, researchContent } = inputData;
      const reviewRepository = getReviewRepository();

      // ドキュメントキャッシュを取得
      const documentCache =
        await reviewRepository.getReviewDocumentCacheByDocumentId(
          reviewHistoryId,
          documentId,
        );

      if (!documentCache) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // RuntimeContext作成
      const runtimeContext = await createRuntimeContext<ReviewChatResearchAgentRuntimeContext>();
      runtimeContext.set('researchContent', researchContent);

      // メッセージを作成
      let messageContent: any[] = [];

      if (documentCache.processMode === 'text' && documentCache.textContent) {
        // テキストコンテンツを使用
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${documentCache.fileName}\n\nResearch Instructions: ${researchContent}\n\nDocument Content:\n${documentCache.textContent}`,
        });
      } else if (documentCache.processMode === 'image' && documentCache.imageData) {
        // 画像データを使用
        messageContent.push({
          type: 'text' as const,
          text: `Document: ${documentCache.fileName}\n\nResearch Instructions: ${researchContent}\n\nPlease analyze the following document images:`,
        });

        documentCache.imageData.forEach((imageBase64, index) => {
          messageContent.push({
            type: 'image' as const,
            image: imageBase64,
          });
        });
      }

      // Mastraエージェント経由でAI呼び出し
      const researchAgent = mastra.getAgent('reviewChatResearchAgent');
      const result = await researchAgent.generate({
        role: 'user',
        content: messageContent,
      }, {
        runtimeContext
      });

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
        documentId,
        researchResult: result.text,
      };
    } catch (error) {
      logger.error(error, 'ドキュメント調査に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// Step 3: 最終回答生成（ストリーミング対応）
const generateAnswerStepInputSchema = z.object({
  reviewHistoryId: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
  researchResults: z.array(
    z.object({
      documentId: z.string(),
      researchResult: z.string(),
    }),
  ),
});

const generateAnswerStepOutputSchema = baseStepOutputSchema.extend({
  answer: z.string().optional(),
});

const generateAnswerStep = createStep({
  id: 'generateAnswerStep',
  description: '最終回答を生成するステップ（ストリーミング）',
  inputSchema: generateAnswerStepInputSchema,
  outputSchema: generateAnswerStepOutputSchema,
  execute: async ({ inputData, bail, mastra, abortSignal, runtimeContext: workflowRuntimeContext }) => {
    try {
      const { reviewHistoryId, checklistIds, question, researchResults } =
        inputData;
      const reviewRepository = getReviewRepository();
      const dataStreamWriter = (workflowRuntimeContext as RuntimeContext<ReviewChatWorkflowRuntimeContext>).get('dataStreamWriter');

      // チェックリスト結果を取得
      const checklistResults =
        await reviewRepository.getChecklistResultsWithIndividualResults(
          reviewHistoryId,
          checklistIds,
        );

      const checklistInfo = checklistResults
        .map((item) => {
          let info = `Checklist: ${item.checklistResult.content}\n`;
          if (item.checklistResult.sourceEvaluation) {
            info += `Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}, Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}`;
          }
          return info;
        })
        .join('\n');

      // 調査結果を統合
      const researchSummary = researchResults
        .map(
          (result) =>
            `Document ID: ${result.documentId}\nFindings: ${result.researchResult}`,
        )
        .join('\n---\n');

      // RuntimeContext作成
      const runtimeContext = await createRuntimeContext<ReviewChatAnswerAgentRuntimeContext>();
      runtimeContext.set('userQuestion', question);
      runtimeContext.set('checklistInfo', checklistInfo);

      const promptText = `User Question: ${question}\n\nResearch Findings:\n${researchSummary}`;

      // Mastraエージェント経由でストリーミングAI呼び出し
      const answerAgent = mastra.getAgent('reviewChatAnswerAgent');
      const result = await answerAgent.generate(promptText, {
        runtimeContext,
        abortSignal,
        onStepFinish: (stepResult) => {
          // AI SDK Data Stream Protocol v1 形式でチャンクを送信
          // https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
          if (stepResult.text) {
            dataStreamWriter.write(`0:${JSON.stringify(stepResult.text)}\n`);
          }
          stepResult.toolCalls.forEach((toolCall) => {
            dataStreamWriter.write(`9:${JSON.stringify(toolCall)}\n`);
          });
          stepResult.toolResults.forEach((toolResult) => {
            dataStreamWriter.write(`a:${JSON.stringify(toolResult)}\n`);
          });
          dataStreamWriter.write(`e:${JSON.stringify({ finishReason: stepResult.finishReason, ...stepResult.usage })}\n`);
        }
      });

      const { success, reason } = judgeFinishReason(result.finishReason);
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      // 最終的なfinish reasonとusage情報を送信
      publishEvent(IpcChannels.REVIEW_CHAT_STREAM_RESPONSE, `d:${JSON.stringify({ finishReason: result.finishReason, ...result.usage })}\n`);

      // 完了イベント送信
      publishEvent(IpcChannels.REVIEW_CHAT_COMPLETE, undefined);

      return {
        status: 'success' as stepStatus,
        answer: result.text,
      };
    } catch (error) {
      logger.error(error, '最終回答の生成に失敗しました');
      const normalizedError = normalizeUnknownError(error);

      // エラーイベント送信
      publishEvent(IpcChannels.REVIEW_CHAT_ERROR, { message: normalizedError.message });

      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// メインワークフロー
export const reviewChatWorkflow = createWorkflow({
  id: 'reviewChatWorkflow',
  inputSchema: reviewChatInputSchema,
  outputSchema: generateAnswerStepOutputSchema,
})
  .then(planResearchStep)
  .map(async ({ inputData, bail, getInitData }) => {
    if (inputData.status === 'failed') {
      return bail(inputData);
    }

    const initData = (await getInitData()) as z.infer<
      typeof reviewChatInputSchema
    >;

    return (inputData.researchTasks || []).map((task) => ({
      reviewHistoryId: initData.reviewHistoryId,
      documentId: task.documentId,
      researchContent: task.researchContent,
    }));
  })
  .foreach(researchDocumentStep, { concurrency: 5 })
  .map(async ({ inputData, bail, getInitData }) => {
    // 失敗があればエラー
    if (inputData.some((item) => item.status === 'failed')) {
      const failed = inputData.find((item) => item.status === 'failed');
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: failed?.errorMessage || '調査に失敗しました',
      });
    }

    const initData = (await getInitData()) as z.infer<
      typeof reviewChatInputSchema
    >;

    return {
      reviewHistoryId: initData.reviewHistoryId,
      checklistIds: initData.checklistIds,
      question: initData.question,
      researchResults: inputData
        .filter((item) => item.status === 'success')
        .map((item) => ({
          documentId: item.documentId!,
          researchResult: item.researchResult!,
        })),
    };
  })
  .then(generateAnswerStep)
  .commit();
