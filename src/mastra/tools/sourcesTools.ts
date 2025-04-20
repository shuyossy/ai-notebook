import { z } from 'zod';
import { db } from '../../db/index.js';
import { Agent } from '@mastra/core/agent';
import { sources, topics } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createTool } from "@mastra/core/tools";
import { FileExtractor } from '@/mastra/utils/fileExtractor';
import { get_SOURCE_QUERY_SYSTEM_PROMPT } from '@/mastra/agents/prompts';
import openAICompatibleModel from '@/mastra/agents/model/openAICompatible.js';

/**
 * ソース一覧表示ツール
 * データベースに保存されているソースとそのトピックを一覧表示する
 */
export const sourceListTool = createTool({
  id: 'sourceListTool',
  description: '登録されているソースの一覧とその要約、トピックを表示する',
  inputSchema: z.object({}),
  outputSchema: z.object({
    sources: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        summary: z.string(),
        topics: z.array(
          z.object({
            name: z.string(),
            summary: z.string(),
          })
        ),
      })
    ),
  }),
  execute: async () => {
    try {
      // ソースの一覧を取得
      const sourcesList = await db.select().from(sources).orderBy(sources.title);

      // 各ソースのトピックを取得して結果を整形
      const result: {
        id: number;
        title: string;
        summary: string;
        topics: {
          name: string;
          summary: string;
        }[];
      }[] = [];
      for (const source of sourcesList) {
        const topicsList = await db
          .select()
          .from(topics)
          .where(eq(topics.sourceId, source.id))
          .orderBy(topics.name);

        result.push({
          id: source.id,
          title: source.title,
          summary: source.summary,
          topics: topicsList.map((topic) => ({
            name: topic.name,
            summary: topic.summary,
          })),
        });
      }

      return {
        sources: result,
      };
    } catch (error) {
      throw new Error(`ソース一覧の取得に失敗しました: ${(error as Error).message}`);
    }
  },
});

/**
 * ソースクエリツール
 * 指定されたソースを読み込み、LLMが検索内容に応答する
 */
export const querySourceTool = createTool({
  id: 'sourceQueryTool',
  description: '特定のソースファイルの内容に基づいて質問に回答する',
  inputSchema: z.object({
    sourceId: z.number().describe('対象のソースID'),
    query: z.string().describe('検索内容や質問'),
  }),
  outputSchema: z.object({
    answer: z.string(),
  }),
  execute: async ({ context: {sourceId, query} }) => {
    try {
      // ソース情報を取得
      const sourceData = await db.select().from(sources).where(eq(sources.id, sourceId));

      if (sourceData.length === 0) {
        throw new Error(`指定されたID ${sourceId} のソースは見つかりませんでした`);
      }

      const source = sourceData[0];

      // ファイルのテキストを抽出
      const filePath = source.path;
      const content = await FileExtractor.extractText(filePath);

      const sourceExpertAgent = new Agent({
        name: 'sourceExpertAgent',
        instructions: get_SOURCE_QUERY_SYSTEM_PROMPT(content),
        model: openAICompatibleModel,
      });

      const answer = (await sourceExpertAgent.generate(query)).text;

      return {
        answer
      };
    } catch (error) {
      throw new Error(`ソース検索に失敗しました: ${(error as Error).message}`);
    }
  },
});
