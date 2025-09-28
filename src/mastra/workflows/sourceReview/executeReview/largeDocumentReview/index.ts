// @ts-ignore
import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { stepStatus } from '../../../types';
import { documentSummarizationStep } from './documentSummarizationStep';
import { checkReviewReadinessStep } from './checkReviewReadinessStep';
import { answerQuestionStep } from './answerQuestionStep';
import { largeDocumentReviewExecutionStep } from './reviewExecutionStep';
import { getMainLogger } from '@/main/lib/logger';
import {
  documentReviewExecutionInputSchema,
  documentReviewExecutionOutputSchema,
} from '..';

const logger = getMainLogger();

//QnA生成と質問応答のサブワークフロー定義
const qnALoopWorkflow = createWorkflow({
  id: 'qnALoopWorkflow',
  inputSchema: checkReviewReadinessStep.outputSchema.extend(
    checkReviewReadinessStep.inputSchema.shape,
  ), // loopのためinputとoutputを統合
  outputSchema: checkReviewReadinessStep.outputSchema.extend(
    checkReviewReadinessStep.inputSchema.shape,
  ),
})
  .map(async ({ inputData }) => {
    return {
      documents: inputData.documents,
      checklists: inputData.checklists,
      additionalInstructions: inputData.additionalInstructions,
    } as z.infer<typeof checkReviewReadinessStep.inputSchema>;
  })
  .then(checkReviewReadinessStep)
  .map(async ({ inputData, bail, getInitData }) => {
    // 前stepはthenかつbailで終了しているので、失敗した場合はここには到達しないはず
    if (inputData.status === 'failed') {
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      });
    }
    const initData = (await getInitData()) as z.infer<
      typeof checkReviewReadinessStep.inputSchema
    >;
    // readyがtrueまたは質問がない場合はループを終了する
    if (inputData.ready || !inputData.additionalQuestions) {
      return bail({
        status: 'success' as stepStatus,
        ready: true,
        additionalQuestions: [],
        documents: initData.documents,
        checklists: initData.checklists,
        additionalInstructions: initData.additionalInstructions,
      });
    }
    return inputData.additionalQuestions.map((questionGroup) => {
      const document = initData.documents.find(
        (d) => d.id === questionGroup.documentId,
      );
      if (document && questionGroup.questions.length > 0) {
        return {
          document,
          checklists: initData.checklists,
          questions: questionGroup.questions,
        } as z.infer<typeof answerQuestionStep.inputSchema>;
      }
    });
  })
  .foreach(answerQuestionStep, { concurrency: 5 })
  .map(async ({ inputData, bail, getInitData, getStepResult }) => {
    const initData = (await getInitData()) as z.infer<
      typeof checkReviewReadinessStep.inputSchema
    >;
    // 全て失敗していた場合、ここで終了させる
    if (inputData.every((item) => item.status === 'failed')) {
      // 最初の要素からエラーメッセージを取得
      let errorMessage: string = '予期せぬエラーが発生しました';
      for (const item of inputData) {
        if (item.status === 'failed' && item.errorMessage) {
          errorMessage = item.errorMessage;
          break;
        }
      }
      return bail({
        status: 'failed' as stepStatus,
        errorMessage,
      });
    }
    // 各ドキュメントのpriorQnAに回答を追加して返す
    const updatedDocuments = initData.documents.map((doc) => {
      const answersForDoc = inputData
        .filter(
          (item) => item.status === 'success' && item.documentId === doc.id,
        )
        .flatMap((item) => item.answers || []);
      return {
        ...doc,
        priorQnA: [...(doc.priorQnA || []), ...answersForDoc],
      };
    });
    return {
      documents: updatedDocuments,
      checklists: initData.checklists,
      additionalInstructions: initData.additionalInstructions,
      ready: getStepResult(checkReviewReadinessStep).ready,
    } as z.infer<typeof checkReviewReadinessStep.inputSchema>;
  })
  .commit();

// 大量ドキュメント用レビューサブワークフロー
export const largeDocumentReviewWorkflow = createWorkflow({
  id: 'largeDocumentReviewWorkflow',
  inputSchema: documentReviewExecutionInputSchema,
  outputSchema: documentReviewExecutionOutputSchema,
})
  .map(async ({ inputData }) => {
    return {
      documents: inputData.documents,
      checklists: inputData.checklists,
    } as z.infer<typeof documentSummarizationStep.inputSchema>;
  })
  .then(documentSummarizationStep)
  .map(async ({ inputData, bail, getInitData }) => {
    // 前stepはthenかつbailで終了しているので、失敗した場合はここには到達しないはず
    if (inputData.status === 'failed') {
      return bail({
        status: 'failed' as stepStatus,
        errorMessages: inputData.errorMessage,
      });
    }
    const initData = (await getInitData()) as z.infer<
      typeof largeDocumentReviewExecutionStep.inputSchema
    >;
    return {
      documents:
        inputData.documents?.map((doc) => ({
          ...doc,
          priorQnA: [] as Array<{ question: string; answer: string }>, // 初回は空
        })) || [],
      checklists: initData.checklists,
      additionalInstructions: initData.additionalInstructions,
      ready: false, // 初回はfalseでスタート
    } as z.infer<typeof qnALoopWorkflow.inputSchema>;
  })
  .dountil(qnALoopWorkflow, async ({ inputData: { ready, status } }) => {
    return ready === true || status === 'failed';
  })
  .map(async ({ inputData, bail, getInitData }) => {
    // 前stepが失敗していた場合はここで終了させる
    if (inputData.status === 'failed') {
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      });
    }
    const initData = (await getInitData()) as z.infer<
      typeof largeDocumentReviewExecutionStep.inputSchema
    >;
    return {
      documents: inputData.documents.map((doc) => ({
        ...doc,
        qnA: doc.priorQnA || [],
      })),
      checklists: inputData.checklists,
      additionalInstructions: inputData.additionalInstructions,
      commentFormat: initData.commentFormat,
      evaluationSettings: initData.evaluationSettings,
    } as z.infer<typeof largeDocumentReviewExecutionStep.inputSchema>;
  })
  .then(largeDocumentReviewExecutionStep)
  .commit();
