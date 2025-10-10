// @ts-ignore
import { createStep } from '@mastra/core';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { z } from 'zod';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import { getReviewRepository } from '@/adapter/db';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import {
  ReviewChatAnswerAgentRuntimeContext
} from '@/mastra/agents/workflowAgents';
import { createRuntimeContext, judgeFinishReason} from '@/mastra/lib/agentUtils';
import { IpcChannels } from '@/types';
import { publishEvent } from '@/main/lib/eventPayloadHelper';
import { ReviewChatWorkflowRuntimeContext } from '.';

const logger = getMainLogger();

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

export const generateAnswerStepOutputSchema = baseStepOutputSchema.extend({
  answer: z.string().optional(),
});

export const generateAnswerStep = createStep({
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
