// @ts-ignore
import { createStep } from '@mastra/core';
import { z } from 'zod';
import { baseStepOutputSchema } from '../../../schema';
import { stepStatus } from '../../../types';
import { createCombinedMessage } from '../../lib';
import { createRuntimeContext, judgeFinishReason } from '@/mastra/lib/agentUtils';
import { ReviewAnswerQuestionAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

const answerQuestionInputSchema = z.object({
  document: z.object({
    id: z.string(),
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
      content: z.string().describe('レビュー対象チェックリストの内容'),
    }),
  ),
  questions: z.array(z.string()).describe('ドキュメントに関する質問のリスト'),
});

const answerQuestionOutputSchema = baseStepOutputSchema.extend({
  documentId: z.string().optional(),
  answers: z.array(
    z.object({
      question: z.string().describe('ドキュメントに関する質問'),
      answer: z.string().describe('その質問に対する回答'),
    }),
  ).optional(),
});

export const answerQuestionStep = createStep({
  id: 'answerQuestionStep',
  description: 'ドキュメントに対する質問に回答するステップ',
  inputSchema: answerQuestionInputSchema,
  outputSchema: answerQuestionOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    const { document, checklists, questions } = inputData;

    if (!questions || questions.length === 0) {
      return {
        status: 'success' as stepStatus,
        answers: [],
      };
    }

    try {
      // ドキュメントをメッセージ形式に変換
      const message = await createCombinedMessage(
        [document],
        'Please answer the following questions based on the document content.',
      );

      // 質問回答エージェントを取得
      const agent = mastra.getAgent('reviewAnswerQuestionAgent');

      // ランタイムコンテキストを作成
      const runtimeContext = await createRuntimeContext<ReviewAnswerQuestionAgentRuntimeContext>();
      runtimeContext.set('checklistItems', checklists);

      // 出力スキーマを定義
      const outputSchema = z.object({
        answers: z.array(
          z.object({
            question: z.string().describe('The question being answered'),
            answer: z.string().describe('The comprehensive answer based on the document content'),
          }),
        ),
      });

      // 質問リストをメッセージに追加
      const questionsText = `## Questions to Answer:
${questions.map((q, index) => `${index + 1}. ${q}`).join('\n')}

Please provide detailed answers to each question based on the document content.`;

      const messageWithQuestions = {
        ...message,
        content: [
          ...message.content,
          {
            type: 'text' as const,
            text: questionsText,
          },
        ],
      };

      // 質問回答を実行
      const result = await agent.generate(messageWithQuestions, {
        output: outputSchema,
        runtimeContext,
        abortSignal,
      });

      const { success, reason } = judgeFinishReason(result.finishReason);
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      if (result.object && result.object.answers) {
        return {
          status: 'success' as stepStatus,
          documentId: document.id,
          answers: result.object.answers,
        };
      } else {
        throw new Error('回答が生成されませんでした');
      }
    } catch (error) {
      logger.error(error, '質問回答ステップでエラーが発生しました');
      const normalizedError = normalizeUnknownError(error);

      return {
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      };
    }
  },
});


