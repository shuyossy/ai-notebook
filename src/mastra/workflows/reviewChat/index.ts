// @ts-ignore
import { createWorkflow } from '@mastra/core';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { DataStreamWriter } from 'ai';
import { z } from 'zod';
import { stepStatus } from '../types';
import { planResearchStep } from './planResearchStep';
import {
  generateAnswerStep,
  generateAnswerStepInputSchema,
  generateAnswerStepOutputSchema,
} from './generateAnswerStep';
import { researchDocumentWithRetryWorkflow } from './researchDocument';
import { getReviewRepository } from '@/adapter/db';

// ワークフローのラインタイムコンテキスト
export type ReviewChatWorkflowRuntimeContext = {
  dataStreamWriter: DataStreamWriter;
  // 擬似的なtoolCallを表現するためのID
  toolCallId: string;
};

// 入力スキーマ
export const reviewChatInputSchema = z.object({
  reviewHistoryId: z.string(),
  checklistIds: z.array(z.number()),
  question: z.string(),
});

// メインワークフロー
export const reviewChatWorkflow = createWorkflow({
  id: 'reviewChatWorkflow',
  inputSchema: reviewChatInputSchema,
  outputSchema: generateAnswerStepOutputSchema,
})
  .then(planResearchStep)
  .map(async ({ inputData, bail, getInitData, runtimeContext }) => {
    if (inputData.status === 'failed') {
      return bail(inputData);
    }

    const initData = (await getInitData()) as z.infer<
      typeof reviewChatInputSchema
    >;

    // ユーザ体験向上のため、調査タスクを擬似的なtoolCallとして表現する
    const toolCallId = (
      runtimeContext as RuntimeContext<ReviewChatWorkflowRuntimeContext>
    ).get('toolCallId');
    const writer = (
      runtimeContext as RuntimeContext<ReviewChatWorkflowRuntimeContext>
    ).get('dataStreamWriter');
    const reviewRepository = getReviewRepository();
    const documentCaches = await reviewRepository.getReviewDocumentCaches(
      initData.reviewHistoryId,
    );
    writer.write(
      `9:${JSON.stringify({
        toolCallId: `reviewChatResearchDocument-${toolCallId}`,
        toolName: 'researchDocumentStart',
        args: inputData.researchTasks?.map((task) => {
          return {
            documentName:
              documentCaches.find((d) => d.documentId === task.documentId)
                ?.fileName || 'Unknown',
            researchContent: task.researchContent,
          };
        }),
      })}\n`,
    );

    return (inputData.researchTasks || []).map((task) => ({
      reviewHistoryId: initData.reviewHistoryId,
      documentId: task.documentId,
      researchContent: task.researchContent,
    }));
  })
  .foreach(researchDocumentWithRetryWorkflow, { concurrency: 5 })
  .map(async ({ inputData, bail, getInitData, runtimeContext }) => {
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

    // ユーザ体験向上のため、調査タスクを擬似的なtoolCallとして表現する
    const toolCallId = (
      runtimeContext as RuntimeContext<ReviewChatWorkflowRuntimeContext>
    ).get('toolCallId');
    const writer = (
      runtimeContext as RuntimeContext<ReviewChatWorkflowRuntimeContext>
    ).get('dataStreamWriter');
    const reviewRepository = getReviewRepository();
    const documentCaches = await reviewRepository.getReviewDocumentCaches(
      initData.reviewHistoryId,
    );
    writer.write(
      `a:${JSON.stringify({
        toolCallId: `reviewChatResearchDocument-${toolCallId}`,
        toolName: 'researchDocumentComplete',
        result: inputData.map((item) => ({
          documentName:
            documentCaches.find((d) => d.documentId === item.documentId)
              ?.fileName || 'Unknown',
          researchResult: item.researchResult!,
        })),
      })}\n`,
    );

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
    } as z.infer<typeof generateAnswerStepInputSchema>;
  })
  .then(generateAnswerStep)
  .commit();
