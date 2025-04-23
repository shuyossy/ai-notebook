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
  // eslint-disable-next-line
  TOPIC_SUMMARY_SYSTEM_PROMPT,
} from '../agents/prompts';
import openAICompatibleModel from '../agents/model/openAICompatible';

// ファイルパスを入力とするスキーマ
const triggerSchema = z.object({
  filePath: z.string().describe('登録するソースのファイルパス'),
  content: z.string().describe('登録するソースの内容'),
});

type stepStatus = 'success' | 'failed';

// 各ステップの共通出力スキーマ部分
const baseStepOutputSchema = z.object({
  status: z.enum(['success', 'failed']),
  errorMessage: z.string().optional(),
});

// ソース分析と登録のステップ
const analyzeSourceStep = new Step({
  id: 'analyzeSourceStep',
  description: 'ソース文書を分析し、タイトルと要約を生成してDBに登録する',
  outputSchema: baseStepOutputSchema.extend({
    sourceId: z.number(),
    title: z.string(),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    // トリガーから変数を取得
    const { content, filePath } = context.triggerData;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let sourceId = -1;
    let title = '';
    let summary = '';
    let errorMessage: string | undefined;

    const db = await getDb();

    try {
      // まず初期レコードを作成
      const insertResult = await db
        .insert(sources)
        .values({
          path: filePath,
          title: '', // 一時的な空の値
          summary: '', // 一時的な空の値
          status: 'processing' as const,
        })
        .onConflictDoUpdate({
          target: sources.path,
          set: {
            status: 'processing' as const,
            error: null,
          },
        })
        .returning({ id: sources.id });

      sourceId = insertResult[0].id;

      // LLMを使用してタイトルと要約を生成
      const summarizeSourceAgent = new Agent({
        name: 'summarizeSourceAgent',
        instructions: SOURCE_ANALYSIS_SYSTEM_PROMPT,
        model: openAICompatibleModel(),
      });

      const outputSchema = z.object({
        title: z.string(),
        summary: z.string(),
      });

      const analysisResult = await summarizeSourceAgent.generate(content, {
        output: outputSchema,
      });

      title = analysisResult.object.title;
      summary = analysisResult.object.summary;

      // 成功時の更新
      await db
        .update(sources)
        .set({
          title,
          summary,
          error: null,
        })
        .where(eq(sources.id, sourceId));

      status = 'success';
    } catch (error) {
      const errorDetail =
        error instanceof Error ? error.message : '不明なエラー';
      errorMessage = `ソース分析でエラーが発生しました: ${errorDetail}`;
      console.error(errorMessage);

      // DBにエラー情報を更新
      await db
        .update(sources)
        .set({ status: 'failed' as const, error: errorMessage })
        .where(eq(sources.id, sourceId));
    }

    return {
      sourceId,
      title,
      summary,
      status,
      errorMessage,
    };
  },
});

// トピックを抽出するステップ
const extractTopicsStep = new Step({
  id: 'extractTopicsStep',
  description: 'ソースからトピックを抽出する',
  outputSchema: baseStepOutputSchema.extend({
    sourceId: z.number(),
    topics: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { content } = context.triggerData;
    const { sourceId } = context.getStepResult('analyzeSourceStep')!;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let topics: string[] = [];
    let errorMessage: string | undefined;

    try {
      // LLMを使用してトピックを抽出
      const extractTopicAgent = new Agent({
        name: 'extractTopicAgent',
        instructions: TOPIC_EXTRACTION_SYSTEM_PROMPT,
        model: openAICompatibleModel(),
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
      const errorDetail =
        error instanceof Error ? error.message : '不明なエラー';
      errorMessage = `トピック抽出でエラーが発生しました: ${errorDetail}`;
      console.error(errorMessage);

      // DBにエラー情報を更新
      const db = await getDb();
      await db
        .update(sources)
        .set({
          status: 'failed' as const,
          error: errorMessage,
        })
        .where(eq(sources.id, sourceId));
    }

    return {
      sourceId,
      topics,
      status,
      errorMessage,
    };
  },
});

// 各トピックの要約を生成するステップ
const generateTopicSummariesStep = new Step({
  id: 'generateTopicSummariesStep',
  description: '各トピックの要約を生成してデータベースに登録する',
  outputSchema: baseStepOutputSchema,
  execute: async ({ context }) => {
    // eslint-disable-next-line
    const { content } = context.triggerData;
    const { sourceId, topics } = context.getStepResult('extractTopicsStep')!;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let errorMessage: string | undefined;

    try {
      // 既存のトピックを削除
      const db = await getDb();
      await db.delete(dbTopics).where(eq(dbTopics.sourceId, sourceId));

      // 各トピックの要約を生成して登録
      const summaries = await Promise.all(
        topics.map(async (topicName: string) => {
          // LLMを使用してトピックを抽出
          // const summarizeTopicAgent = new Agent({
          //   name: 'summarizeTopicAgent',
          //   instructions: TOPIC_SUMMARY_SYSTEM_PROMPT,
          //   model: openAICompatibleModel(),
          // });

          // const topicPrompt = `以下の文書から「${topicName}」というトピックに関連する情報を抽出し、要約してください。\n\n${content}`;

          // LLMを使用してトピックの要約を生成
          // const topicSummaryResult =
          //  await summarizeTopicAgent.generate(topicPrompt);
          const topicSummaryResult = { text: '予約処理に失敗しました' };

          return {
            sourceId,
            name: topicName,
            summary: topicSummaryResult.text,
          };
        }),
      );
      // トピックをデータベースに登録
      await db.insert(dbTopics).values(summaries);

      // 成功時の更新
      await db
        .update(sources)
        .set({
          status: 'completed' as const,
          error: null,
        })
        .where(eq(sources.id, sourceId));
      status = 'success';
    } catch (error) {
      const errorDetail =
        error instanceof Error ? error.message : '不明なエラー';
      errorMessage = `トピック要約の生成でエラーが発生しました: ${errorDetail}`;
      console.error(errorMessage);

      // DBにエラー情報を更新
      const db = await getDb();
      await db
        .update(sources)
        .set({
          status: 'failed' as const,
          error: errorMessage,
        })
        .where(eq(sources.path, sourceId));
    }

    return {
      status,
      errorMessage,
    };
  },
});

// 全ステップを結合したワークフロー
export const sourceRegistrationWorkflow = new Workflow({
  name: 'source-registration',
  triggerSchema,
});

// ワークフローを構築
// eslint-disable-next-line
sourceRegistrationWorkflow
  .step(analyzeSourceStep)
  .then(extractTopicsStep, {
    when: {
      'analyzeSourceStep.status': 'success',
    },
  })
  .then(generateTopicSummariesStep, {
    when: {
      'extractTopicsStep.status': 'success',
    },
  })
  .commit();
