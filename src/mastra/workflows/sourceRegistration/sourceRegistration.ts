/* eslint-disable import/prefer-default-export */
// @ts-ignore
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { stepStatus } from '../types';
import { baseStepOutputSchema } from '../schema';
import { getSourceRepository } from '@/adapter/db';
import { createRuntimeContext, judgeFinishReason } from '../../lib/agentUtils';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';
import FileExtractor from '@/main/lib/fileExtractor';

const logger = getMainLogger();

const triggerSchema = z.object({
  filePath: z.string().describe('登録するソースのファイルパス'),
});

const analyzeSourceOutputSchema = baseStepOutputSchema.extend({
  sourceId: z.number(),
  title: z.string(),
  summary: z.string(),
});

const sourceRepository = getSourceRepository();

// ソース分析と登録のステップ
const analyzeSourceStep = createStep({
  id: 'analyzeSourceStep',
  description: 'ソース文書を分析し、タイトルと要約を生成してDBに登録する',
  inputSchema: triggerSchema,
  outputSchema: analyzeSourceOutputSchema,
  execute: async ({ inputData, mastra }) => {
    // トリガーから変数を取得
    const { filePath } = inputData;

    // 結果の初期値
    let status: stepStatus = 'failed';
    let sourceId = -1;
    let title = '';
    let summary = '';
    let content = '';
    let errorMessage: string | undefined;

    try {
      // まず初期レコードを作成
      const insertResult = await sourceRepository.initializeProcessingSource({
        path: filePath,
        title: '', // 一時的な空の値
        summary: '', // 一時的な空の値
        status: 'processing',
      });

      sourceId = insertResult.id;

      const extractionResult = await FileExtractor.extractText(filePath);
      content = extractionResult.content;

      // LLMを使用してタイトルと要約を生成
      const summarizeSourceAgent = mastra.getAgent('summarizeSourceAgent');

      const outputSchema = z.object({
        title: z.string(),
        summary: z.string(),
      });

      const analysisResult = await summarizeSourceAgent.generateLegacy(
        content,
        {
          runtimeContext: await createRuntimeContext(),
          output: outputSchema,
        },
      );

      const { success, reason } = judgeFinishReason(
        analysisResult.finishReason,
      );
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      title = analysisResult.object.title;
      summary = analysisResult.object.summary;

      // 成功時の更新
      await sourceRepository.updateSource({
        id: sourceId,
        title,
        summary,
        error: null,
      });

      status = 'success';
    } catch (error) {
      logger.error(error, 'ソース分析に失敗しました');
      let errorDetail: string;
      const normalizedError = normalizeUnknownError(error);
      errorDetail = normalizedError.message;
      errorMessage = `ソース分析に失敗しました\n${errorDetail}`;
      // DBにエラー情報を更新
      await sourceRepository.updateProcessingStatus({
        id: sourceId,
        status: 'failed',
        error: errorMessage,
      });
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

// トピックと要約を一度に生成するステップ
const extractTopicAndSummaryStep = createStep({
  id: 'generateTopicAndSummaryStep',
  description: 'トピックとその要約を生成してデータベースに登録する',
  inputSchema: analyzeSourceOutputSchema,
  outputSchema: baseStepOutputSchema,
  execute: async ({ inputData, getInitData, mastra }) => {
    const { filePath } = getInitData() as z.infer<typeof triggerSchema>;
    const { sourceId } = inputData;

    // 前ステップがfailedの場合はそのまま返す
    if (inputData.status === 'failed') {
      return {
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      };
    }

    // 結果の初期値
    let status: stepStatus = 'failed';
    let errorMessage: string | undefined;

    try {
      const extractionResult = await FileExtractor.extractText(filePath);
      const content = extractionResult.content;

      // LLMを使用してトピックと要約を生成
      const summarizeTopicAgent = mastra.getAgent('summarizeTopicAgent');

      const outputSchema = z.object({
        topicAndSummaryList: z.array(
          z.object({
            topic: z.string(),
            summary: z.string(),
          }),
        ),
      });

      const analysisResult = await summarizeTopicAgent.generateLegacy(content, {
        runtimeContext: await createRuntimeContext(),
        output: outputSchema,
      });
      const { success, reason } = judgeFinishReason(
        analysisResult.finishReason,
      );
      if (!success) {
        throw internalError({
          expose: true,
          messageCode: 'AI_API_ERROR',
          messageParams: { detail: reason },
        });
      }

      // トピックと要約をデータベースに登録
      const values = analysisResult.object.topicAndSummaryList.map(
        (topicSummary) => ({
          sourceId,
          name: topicSummary.topic,
          summary: topicSummary.summary,
        }),
      );
      await sourceRepository.registerTopic(values);

      // 成功時の更新
      await sourceRepository.updateProcessingStatus({
        id: sourceId,
        status: 'completed',
        error: null,
      });
      await sourceRepository.updateSourceEnabled(sourceId, true);
      status = 'success';
    } catch (error) {
      let errorDetail: string;
      const normalizedError = normalizeUnknownError(error);
      errorDetail = normalizedError.message;
      errorMessage = `ソース分析でエラーが発生しました:\n${errorDetail}`;
      console.error(error);

      // DBにエラー情報を更新
      await sourceRepository.updateProcessingStatus({
        id: sourceId,
        status: 'failed',
        error: errorMessage,
      });
    }

    return {
      status,
      errorMessage,
    };
  },
});

// 全ステップを結合したワークフロー
export const sourceRegistrationWorkflow = createWorkflow({
  id: 'sourceRegistration',
  inputSchema: triggerSchema,
  // ドキュメントには最終ステップの出力スキーマを指定すれば良いように記載があるが、実際の出力結果は{最終ステップ: outputSchema}となっている
  // Matraのバグ？
  outputSchema: baseStepOutputSchema,
  steps: [analyzeSourceStep, extractTopicAndSummaryStep],
})
  .then(analyzeSourceStep)
  .then(extractTopicAndSummaryStep)
  .commit();
