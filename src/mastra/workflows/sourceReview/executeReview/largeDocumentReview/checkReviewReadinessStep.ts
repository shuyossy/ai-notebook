import { z } from 'zod';
import { baseStepOutputSchema } from '../../../schema';
// @ts-ignore
import { createStep } from '@mastra/core/workflows';
import { getMainLogger } from '@/main/lib/logger';
import {
  createRuntimeContext,
  judgeFinishReason,
} from '@/mastra/lib/agentUtils';
import {
  ReviewCheckReviewReadinessFirstRunAgentRuntimeContext,
  ReviewCheckReviewReadinessSubsequentAgentRuntimeContext,
} from '@/mastra/agents/workflowAgents';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { stepStatus } from '@/mastra/workflows/types';
import { getChecklistsErrorMessage } from '../lib';

const logger = getMainLogger();

const checkReviewReadinessInputSchema = z.object({
  additionalInstructions: z
    .string()
    .optional()
    .describe('レビューに対する追加指示'),
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
      topicAndSummary: z.array(
        z.object({
          topic: z.string().describe('ドキュメントから抽出されたトピック'),
          summary: z
            .string()
            .describe('そのトピックに関するドキュメントの要約'),
        }),
      ),
      // レビューを実行するための、ドキュメントに関する質問・回答の蓄積情報
      priorQnA: z
        .array(
          z.object({
            question: z.string().describe('ドキュメントに関する質問'),
            answer: z.string().describe('その質問に対する回答'),
          }),
        )
        .optional()
        .describe(
          'レビューを実行するための、ドキュメントに関する質問・回答の蓄積情報',
        ),
    }),
  ),
  checklists: z.array(
    z.object({
      id: z.number(),
      content: z.string().describe('チェックリストの内容'),
    }),
  ),
});

const checkReviewReadinessOutputSchema = baseStepOutputSchema.extend({
  ready: z
    .boolean()
    .describe('レビューに十分な情報が含まれているか')
    .optional(),
  additionalQuestions: z
    .array(z.object({ documentId: z.string(), questions: z.array(z.string()) }))
    .optional()
    .describe('不足している場合の追加質問'),
});

// チェックリストレビューに十分な情報が含まれているかを確認するstep(readyがtrueになるまで繰り返し実行するようにworkflowで制御する)
export const checkReviewReadinessStep = createStep({
  id: 'checkReviewReadinessStep',
  description:
    'チェックリストレビューに十分な情報が含まれているかを確認するステップ(readyがtrueになるまで繰り返し実行するようにworkflowで制御する)',
  inputSchema: checkReviewReadinessInputSchema,
  outputSchema: checkReviewReadinessOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { documents, checklists, additionalInstructions } = inputData;

    try {
      // priorQnAがundefinedまたは空の場合は初回実行とみなす
      const isFirstRun = documents.every(
        (doc) => !doc.priorQnA || doc.priorQnA.length === 0,
      );

      let agent;
      let runtimeContext;

      // ユーザプロンプト
      const message = `${documents
        .map(
          (doc) => `# Document ID: ${doc.id}
- Name: ${doc.name}
## Summary and Topics:
${doc.topicAndSummary
  .map(
    (ts) => `- Topic: ${ts.topic}
  - Summary: ${ts.summary}`,
  )
  .join('\n\n')}`,
        )
        .join('\n\n')}
`;
      if (isFirstRun) {
        // レビュー実行に必要な質問のみを生成するAIプロンプトを実行する
        agent = mastra.getAgent('reviewCheckReviewReadinessFirstRunAgent');

        runtimeContext =
          await createRuntimeContext<ReviewCheckReviewReadinessFirstRunAgentRuntimeContext>();
        runtimeContext.set('checklistItems', checklists);
        runtimeContext.set('additionalInstructions', additionalInstructions);

        const outputSchema = z.object({
          additionalQuestions: z
            .array(
              z.object({
                documentId: z
                  .string()
                  .describe(
                    'The ID of the document for which additional information is needed.',
                  ),
                questions: z
                  .array(z.string())
                  .describe(
                    'A list of questions that need to be answered to ensure a thorough review based on the checklist items.',
                  ),
              }),
            )
            .describe('List of additional questions needed for review'),
        });

        const result = await agent.generate(message, {
          output: outputSchema,
          abortSignal: undefined,
          runtimeContext,
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
          ...result.object,
          ready: false,
        };
      } else {
        // priorQnAが存在する場合は2回目以降の実行とみなす
        agent = mastra.getAgent('reviewCheckReviewReadinessSubsequentRunAgent');

        runtimeContext =
          await createRuntimeContext<ReviewCheckReviewReadinessSubsequentAgentRuntimeContext>();
        runtimeContext.set('checklistItems', checklists);
        runtimeContext.set('additionalInstructions', additionalInstructions);
        runtimeContext.set(
          'priorQnA',
          documents.map((doc) => ({
            documentId: doc.id,
            documentName: doc.name,
            qna: doc.priorQnA || [],
          })),
        );

        const outputSchema = z.object({
          additionalQuestions: z
            .array(
              z.object({
                documentId: z
                  .string()
                  .describe(
                    'The ID of the document for which additional information is needed.',
                  ),
                questions: z
                  .array(z.string())
                  .describe(
                    'A list of questions that need to be answered to ensure a thorough review based on the checklist items.',
                  ),
              }),
            )
            .optional()
            .describe('List of additional questions needed for review'),
          ready: z
            .boolean()
            .describe(
              'Indicates whether the provided information is sufficient to proceed with the review based on the checklist items.',
            ),
        });

        const result = await agent.generate(message, {
          output: outputSchema,
          abortSignal: undefined,
          runtimeContext,
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
          ...result.object,
        };
      }
    } catch (error) {
      logger.error(error, 'レビュー準備確認ステップでエラーが発生しました');
      const normalizedError = normalizeUnknownError(error);

      return {
        status: 'failed' as stepStatus,
        errorMessage: getChecklistsErrorMessage(checklists, normalizedError.message),
      };
    }
  },
});
