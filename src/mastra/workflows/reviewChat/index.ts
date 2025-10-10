// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { DataStreamWriter } from 'ai';
import { z } from 'zod';
import { stepStatus } from '../types';
import { planResearchStep } from './planResearchStep';
import { generateAnswerStep, generateAnswerStepOutputSchema } from './generateAnswerStep';
import { researchDocumentWithRetryWorkflow } from './researchDocument';

// ワークフローのラインタイムコンテキスト
export type ReviewChatWorkflowRuntimeContext = {
  dataStreamWriter: DataStreamWriter;
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
  .foreach(researchDocumentWithRetryWorkflow, { concurrency: 5 })
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
