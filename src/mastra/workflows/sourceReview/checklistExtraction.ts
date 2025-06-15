import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import path from 'path';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import { CHECKLIST_EXTRACTION_SYSTEM_PROMPT } from '../../agents/prompts';
import { Source } from '../../../db/schema';
import FileExtractor from '../../../main/utils/fileExtractor';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import openAICompatibleModel from '../../agents/model/openAICompatible';

// ワークフローの入力スキーマ
const triggerSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  sourceIds: z
    .array(z.number())
    .describe('チェックリストを抽出するソースのIDリスト'),
});

const checklistExtractionStep = new Step({
  id: 'checklistExtractionStep',
  description: '各ソースからチェックリストを抽出するステップ',
  outputSchema: baseStepOutputSchema,
  execute: async ({ context }) => {
    // レビュー用のリポジトリを取得
    const reviewRepository = getReviewRepository();
    const sourceRepository = getSourceRepository();
    // トリガーから入力を取得
    const { reviewHistoryId, sourceIds } = context.triggerData as z.infer<
      typeof triggerSchema
    >;
    const errorMessages: string[] = [
      'チェックリスト抽出処理で以下エラーが発生しました',
    ];

    try {
      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      // 各ソースを並行して処理
      const extractionPromises = sourceIds.map(async (sourceId) => {
        let source: Source | null = null;
        try {
          source = await sourceRepository.getSourceById(sourceId);

          if (source === null) {
            throw new Error(`ソースID ${sourceId} が見つかりません`);
          }

          // ファイル内容を抽出
          const { content } = await FileExtractor.extractText(source.path);

          const checklistExtractionAgent = new Agent({
            name: 'checklistExtractionAgent',
            instructions: CHECKLIST_EXTRACTION_SYSTEM_PROMPT,
            model: openAICompatibleModel(),
          });
          const outputSchema = z.object({
            isChecklistDocument: z
              .boolean()
              .describe('Whether the given source is a checklist document'),
            checklists: z
              .array(z.string().describe('Checklist item'))
              .optional()
              .describe('Extracted checklists'),
          });

          const extractionResult = await checklistExtractionAgent.generate(
            content,
            {
              output: outputSchema,
            },
          );

          if (!extractionResult.object.isChecklistDocument) {
            throw new Error(
              `ソース "${source.title}" はチェックリスト抽出に適さないドキュメントです`,
            );
          }

          if (
            !extractionResult.object.checklists ||
            extractionResult.object.checklists.length === 0
          ) {
            throw new Error(
              `ソース "${source.title}" からチェックリストが抽出されませんでした`,
            );
          }

          // 抽出されたチェックリストをDBに保存
          for (const checklistItem of extractionResult.object.checklists) {
            await reviewRepository.createChecklist(
              reviewHistoryId,
              checklistItem,
              'system',
            );
          }
        } catch (error) {
          const errorMessageList: string[] = [];
          if (source) {
            errorMessageList.push(
              `${path.basename(source.path)}のチェックリスト抽出でエラー: `,
            );
          }
          errorMessageList.push(
            error instanceof Error ? error.message : '不明なエラー',
          );
          errorMessages.push(errorMessageList.join(''));
        }
      });

      // 全ての抽出処理が完了するまで待機
      await Promise.all(extractionPromises);

      // エラーがあれば失敗として返す
      if (errorMessages.length > 1) {
        throw new Error();
      }

      return {
        status: 'success' as stepStatus,
      };
    } catch (error) {
      errorMessages.push(
        error instanceof Error && error.message
          ? error.message
          : '不明なエラー',
      );
      return {
        status: 'failed' as stepStatus,
        errorMessage: errorMessages.join('\n'),
      };
    }
  },
});

/**
 * 各ソースからチェックリストを抽出するワークフロー
 */
export const checklistExtractionWorkflow = new Workflow({
  name: 'checklistExtractionWorkflow',
  triggerSchema,
});

// ワークフローを構築
// eslint-disable-next-line
checklistExtractionWorkflow.step(checklistExtractionStep).commit();
