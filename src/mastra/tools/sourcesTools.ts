import { APICallError } from 'ai';
import { z } from 'zod';
// @ts-ignore
import { createTool } from '@mastra/core/tools';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { eq, and } from 'drizzle-orm';
import { sources } from '@/db/schema';
import getDb from '@/db/index';
import FileExtractor from '@/main/lib/fileExtractor';
import { createBaseToolResponseSchema, RunToolStatus } from './types';
import { DocumentExpertAgentRuntimeContext } from '../agents/toolAgents';
import { createRuntimeContext, judgeFinishReason } from '../lib/agentUtils';

/**
 * ソース一覧表示ツール
 * データベースに保存されているソースとそのトピックを一覧表示する
 */
// export const sourceListTool = createTool({
//   id: 'sourceListTool',
//   description: '登録されているソースの一覧とその要約、トピックを表示する',
//   outputSchema: createBaseToolResponseSchema(
//     z.object({
//       sources: z.array(
//         z.object({
//           id: z.number(),
//           title: z.string(),
//           summary: z.string(),
//           topics: z.array(
//             z.object({
//               name: z.string(),
//               summary: z.string(),
//             }),
//           ),
//         }),
//       ),
//     }),
//   ),
//   execute: async () => {
//     let status: RunToolStatus = 'failed';
//     try {
//       const db = await getDb();
//       // ソースの一覧を取得（将来的にisEnabled=trueのみに絞り込む）
//       const sourcesList = await db
//         .select()
//         .from(sources)
//         .where(eq(sources.isEnabled, 1))
//         .orderBy(sources.title);

//       // 各ソースのトピックを取得して結果を整形
//       const result = await Promise.all(
//         sourcesList.map(async (source) => {
//           const topicsList = await db
//             .select()
//             .from(topics)
//             .where(eq(topics.sourceId, source.id))
//             .orderBy(topics.name);

//           return {
//             id: source.id,
//             path: source.path,
//             title: source.title,
//             summary: source.summary,
//             topics: topicsList.map((topic) => ({
//               name: topic.name,
//               summary: topic.summary,
//             })),
//           };
//         }),
//       );
//       status = 'success';
//       return {
//         status,
//         result: {
//           sources: result,
//         },
//       };
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error
//           ? `${error.message}\n${error.stack}`
//           : String(error);
//       status = 'failed';
//       return {
//         status,
//         error: `ソース一覧の取得に失敗しました: ${errorMessage}`,
//       };
//     }
//   },
// });

/**
 * ソースクエリツール
 * 指定されたソースを読み込み、LLMが検索内容に応答する
 */
export const documentQueryTool = createTool({
  id: 'documentQueryTool',
  description:
    'The expert AI agent processes each query in isolation using the registered document content. Each query will be handled without any dependence on prior or subsequent queries, ensuring no shared context or state is used.',
  inputSchema: z.object({
    documentQueries: z.array(
      z.object({
        sourceId: z.number().describe('Document ID to query (required)'),
        path: z.string().describe('Document file path (required)'),
        query: z.string().describe('Search query or question (required)'),
      }),
    ),
  }),
  outputSchema: createBaseToolResponseSchema(
    z.object({
      answers: z.array(
        z.object({
          sourceId: z.number(),
          path: z.string(),
          query: z.string(),
          answer: z.string(),
        }),
      ),
    }),
  ),
  execute: async ({ context: { documentQueries }, mastra }, options) => {
    if (mastra === undefined) {
      return {
        status: 'failed' as RunToolStatus,
        error: 'Mastraインスタンスが初期化されていません',
      };
    }
    let status: RunToolStatus = 'failed';
    try {
      const db = await getDb();
      // 各クエリに対応するソースの情報を取得
      const uniqueSourceIds = [
        ...new Set(documentQueries.map((item) => item.sourceId)),
      ];
      const sourceDataMap = new Map();

      // 全ての必要なソース情報を一括で取得
      for (const sourceId of uniqueSourceIds) {
        const sourceData = await db
          .select()
          .from(sources)
          .where(and(eq(sources.id, sourceId), eq(sources.isEnabled, 1)));

        if (sourceData.length === 0) {
          status = 'failed';
          return {
            status,
            error: `Source not found for ID: ${sourceId}`,
          };
        }

        sourceDataMap.set(sourceId, sourceData[0]);
      }

      // 各クエリを並列で処理
      const answers = await Promise.all(
        documentQueries.map(async (item) => {
          let answer: string = '';
          try {
            const source = sourceDataMap.get(item.sourceId);
            const { content } = await FileExtractor.extractText(source.path);

            const documentExpertAgent = mastra.getAgent('documentExpertAgent');

            const runtimeContext =
              await createRuntimeContext<DocumentExpertAgentRuntimeContext>();

            runtimeContext.set('documentContent', content);

            const res = await documentExpertAgent.generate(item.query, {
              abortSignal: options?.abortSignal,
              runtimeContext,
            });
            answer = res.text;
            const { success, reason } = judgeFinishReason(res.finishReason);
            if (!success) {
              throw new Error(reason);
            }
          } catch (error) {
            answer = `error occured while processing the query: ${error instanceof Error ? `: ${error.message}` : JSON.stringify(error)}`;
          }
          return {
            sourceId: item.sourceId,
            path: item.path,
            query: item.query,
            answer,
          };
        }),
      );
      status = 'success';
      return {
        status,
        result: {
          answers,
        },
      };
    } catch (error) {
      let errorDetail: string;
      if (
        error instanceof MastraError &&
        APICallError.isInstance(error.cause)
      ) {
        // APIコールエラーの場合はresponseBodyの内容を取得
        errorDetail = error.cause.message;
        if (error.cause.responseBody) {
          errorDetail += `:\n${error.cause.responseBody}`;
        }
      } else if (error instanceof Error) {
        errorDetail = error.message;
      } else {
        errorDetail = JSON.stringify(error);
      }
      const errorMessage = `ドキュメント検索ツール実行時にエラーが発生しました:\n${errorDetail}`;

      status = 'failed';
      return {
        status,
        error: errorMessage,
      };
    }
  },
});
