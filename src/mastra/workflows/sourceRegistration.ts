/* eslint-disable import/prefer-default-export */
import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { eq } from 'drizzle-orm';
import getDb from '../../db';
import { sources, topics as dbTopics } from '../../db/schema';
import {
  SOURCE_ANALYSIS_SYSTEM_PROMPT,
  TOPIC_EXTRACTION_SYSTEM_PROMPT,
  TOPIC_SUMMARY_SYSTEM_PROMPT,
} from '../agents/prompts';
import openAICompatibleModel from '../agents/model/openAICompatible';

// ファイルパスを入力とするスキーマ
const triggerSchema = z.object({
  filePath: z.string().describe('登録するソースのファイルパス'),
  content: z.string().describe('登録するソースの内容'),
});

type stepStatus = 'success' | 'failed';

// ソース分析のステップ
const analyzeSourceStep = new Step({
  id: 'analyzeSource',
  description: 'ソース文書を分析し、タイトルと要約を生成する',
  outputSchema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(['success', 'failed']),
  }),
  execute: async ({ context }) => {
    // トリガーから変数を取得
    const { content } = context.triggerData;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let title = '';
    let summary = '';

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

      const analysisResult = await summarizeSourceAgent.generate(content, {
        output: outputSchema,
      });

      status = 'success';
      title = analysisResult.object.title;
      summary = analysisResult.object.summary;
    } catch (error) {
      console.error('ソース分析に失敗しました', error);
    }
    return {
      title,
      summary,
      status,
    };
  },
});

// ソース情報をデータベースに登録するステップ
const registerSourceStep = new Step({
  id: 'registerSource',
  description: 'ソース情報をデータベースに登録する',
  outputSchema: z.object({
    sourceId: z.number(),
    status: z.enum(['success', 'failed']),
  }),
  execute: async ({ context }) => {
    const { filePath } = context.triggerData;
    const { title, summary } = context.getStepResult('analyzeSource')!;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let sourceId = -1;

    try {
      const db = await getDb();
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

      sourceId = insertResult[0].id;
      status = 'success';
    } catch (error) {
      console.error('ソース登録に失敗しました', error);
    }
    return {
      sourceId,
      status,
    };
  },
});

// トピックを抽出するステップ
const extractTopicsStep = new Step({
  id: 'extractTopics',
  description: 'ソースからトピックを抽出する',
  outputSchema: z.object({
    sourceId: z.number(),
    topics: z.array(z.string()),
    status: z.enum(['success', 'failed']),
  }),
  execute: async ({ context }) => {
    const { content } = context.triggerData;
    const { sourceId } = context.getStepResult('registerSource')!;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let topics: string[] = [];

    try {
      // LLMを使用してトピックを抽出
      const extractTopicAgent = new Agent({
        name: 'extractTopicAgent',
        instructions: TOPIC_EXTRACTION_SYSTEM_PROMPT,
        model: openAICompatibleModel,
      });

      const outputSchema = z.object({
        topics: z.array(z.string()),
      });

      const extractResult = await extractTopicAgent.generate(content, {
        output: outputSchema,
      });
      topics = extractResult.object.topics;
      status = 'success';
    } catch (error) {
      console.error('トピック抽出に失敗しました', error);
    }
    return {
      sourceId,
      topics,
      status,
    };
  },
});

// 各トピックの要約を生成するステップ
const generateTopicSummariesStep = new Step({
  id: 'generateTopicSummaries',
  description: '各トピックの要約を生成してデータベースに登録する',
  outputSchema: z.object({
    status: z.enum(['success', 'failed']),
  }),
  execute: async ({ context }) => {
    const { content } = context.triggerData;
    const { sourceId, topics } = context.getStepResult('extractTopics')!;

    // 結果の初期値
    let status: stepStatus = 'failed';

    try {
      // 既存のトピックを削除
      const db = await getDb();
      await db.delete(dbTopics).where(eq(dbTopics.sourceId, sourceId));

      // 各トピックの要約を生成して登録
      const summaries = await Promise.all(
        topics.map(async (topicName: string) => {
          // LLMを使用してトピックを抽出
          const summarizeTopicAgent = new Agent({
            name: 'summarizeTopicAgent',
            instructions: TOPIC_SUMMARY_SYSTEM_PROMPT,
            model: openAICompatibleModel,
          });

          const topicPrompt = `以下の文書から「${topicName}」というトピックに関連する情報を抽出し、要約してください。\n\n${content}`;

          // LLMを使用してトピックの要約を生成
          const topicSummaryResult =
            await summarizeTopicAgent.generate(topicPrompt);

          return {
            sourceId,
            name: topicName,
            summary: topicSummaryResult.text,
          };
        }),
      );
      // トピックをデータベースに登録
      await db.insert(dbTopics).values(summaries);
      status = 'success';
    } catch (error) {
      console.error('トピック要約の生成に失敗しました', error);
    }
    return {
      status,
    };
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
