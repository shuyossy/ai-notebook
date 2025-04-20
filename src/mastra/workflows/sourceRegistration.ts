import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { db } from '@/db';
import { sources, topics as db_topics } from '@/db/schema';
import {
  SOURCE_ANALYSIS_SYSTEM_PROMPT,
  TOPIC_EXTRACTION_SYSTEM_PROMPT,
  TOPIC_SUMMARY_SYSTEM_PROMPT,
} from '@/mastra/agents/prompts.js';
import { eq } from 'drizzle-orm';
import openAICompatibleModel from '@/mastra/agents/model/openAICompatible';

// ファイルパスを入力とするスキーマ
const triggerSchema = z.object({
  filePath: z.string().describe('登録するソースのファイルパス'),
  content: z.string().describe('登録するソースの内容'),
});

// ソース分析のステップ
const analyzeSourceStep = new Step({
  id: 'analyzeSource',
  description: 'ソース文書を分析し、タイトルと要約を生成する',
  outputSchema: z.object({
    title: z.string(),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    // トリガーから変数を取得
    const { content } = context.triggerData;

    try {
      // LLMを使用してタイトルと要約を生成
      const summarizeSourceAgent = new Agent({
        name: 'summarizeSourceAgent',
        instructions: SOURCE_ANALYSIS_SYSTEM_PROMPT,
        model: openAICompatibleModel,
      });

      const outputSchema = z.object({
        title: z.string(),
        summary: z.string(),
      });

      const analysisResult = await summarizeSourceAgent.generate(content, {output: outputSchema});

      return {
        title: analysisResult.object.title,
        summary: analysisResult.object.summary,
      };
    } catch (error) {
      throw new Error(`ソース分析に失敗しました: ${(error as Error).message}`);
    }
  },
});

// ソース情報をデータベースに登録するステップ
const registerSourceStep = new Step({
  id: 'registerSource',
  description: 'ソース情報をデータベースに登録する',
  outputSchema: z.object({
    sourceId: z.number(),
  }),
  execute: async ({ context }) => {
    const { filePath, content } = context.triggerData;
    const { title, summary } = context.getStepResult('analyzeSource')!;

    try {
      const insertResult = await db
        .insert(sources)
        .values({
          path: filePath,
          title,
          summary,
        })
        .onConflictDoUpdate({
          target: sources.path,
          set: {
            title,
            summary,
          },
        })
        .returning({ id: sources.id });

      const  sourceId = insertResult[0].id;

      return {
        sourceId
      };
    } catch (error) {
      throw new Error(`ソース登録に失敗しました: ${(error as Error).message}`);
    }
  },
});

// トピックを抽出するステップ
const extractTopicsStep = new Step({
  id: 'extractTopics',
  description: 'ソースからトピックを抽出する',
  outputSchema: z.object({
    sourceId: z.number(),
    topics: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { content } = context.triggerData;
    const { sourceId } = context.getStepResult('registerSource')!;

    try {
      // LLMを使用してトピックを抽出
      const extractTopicAgent = new Agent({
        name: 'extractTopicAgent',
        instructions: TOPIC_EXTRACTION_SYSTEM_PROMPT,
        model: openAICompatibleModel,
      });

      const outputSchema = z.object({
        topics: z.array(z.string())
      });

      const extractResult = await extractTopicAgent.generate(content, {output: outputSchema});

      return {
        sourceId,
        topics: extractResult.object.topics,
      };
    } catch (error) {
      throw new Error(`トピック抽出に失敗しました: ${(error as Error).message}`);
    }
  },
});

// 各トピックの要約を生成するステップ
const generateTopicSummariesStep = new Step({
  id: 'generateTopicSummaries',
  description: '各トピックの要約を生成してデータベースに登録する',
  outputSchema: z.object({}),
  execute: async ({ context }) => {
    const { content } = context.triggerData;
    const { sourceId, topics } = context.getStepResult('extractTopics')!;
    const topicSummaries: { topicName: string; summary: string }[] = [];

    try {
      // 既存のトピックを削除
      await db.delete(db_topics).where(eq(db_topics.sourceId, sourceId));

      // 各トピックの要約を生成して登録
      for (const topicName of topics) {
        // LLMを使用してトピックを抽出
        const summarizeTopicAgent = new Agent({
          name: 'summarizeTopicAgent',
          instructions: TOPIC_SUMMARY_SYSTEM_PROMPT,
          model: openAICompatibleModel,
        });

        const topicPrompt = `以下の文書から「${topicName}」というトピックに関連する情報を抽出し、要約してください。\n\n${content}`;

        // LLMを使用してトピックの要約を生成
        const topicSummaryResult = await summarizeTopicAgent.generate(
          topicPrompt
        );

        // トピックをデータベースに登録
        await db.insert(db_topics).values({
          sourceId,
          name: topicName,
          summary: topicSummaryResult.text,
        });

        // 結果を配列に追加
        topicSummaries.push({
          topicName,
          summary: topicSummaryResult.text,
        });

      }
      
      return {};

    } catch (error) {
      throw new Error(`トピック要約の生成に失敗しました: ${(error as Error).message}`);
    }
  },
});

// 全ステップを結合したワークフロー
export const sourceRegistrationWorkflow = new Workflow({
  name: 'source-registration',
  triggerSchema,
});

// ワークフローを構築
sourceRegistrationWorkflow
  .step(analyzeSourceStep)
  .then(registerSourceStep)
  .then(extractTopicsStep)
  .then(generateTopicSummariesStep)
  .commit();
