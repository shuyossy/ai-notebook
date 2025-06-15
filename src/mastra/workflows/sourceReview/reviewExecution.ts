import { Workflow, Step } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import path from 'path';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import {
  CHECKLIST_CATEGORY_CLASSIFICATION_SYSTEM_PROMPT,
  getDocumentReviewExecutionPrompt,
} from '../../agents/prompts';
import FileExtractor from '../../../main/utils/fileExtractor';
import type { ReviewEvaluation } from '../../../main/types';
import { baseStepOutputSchema } from '../schema';
import openAICompatibleModel from '../../agents/model/openAICompatible';
import { stepStatus } from '../types';

// カテゴリ分類ステップの出力スキーマ
const classifyChecklistsByCategoryOutputSchema = baseStepOutputSchema.extend({
  categories: z
    .array(
      z.object({
        name: z.string(),
        checklists: z.array(
          z.object({
            id: z.number(),
            content: z.string().describe('チェックリストの内容'),
          }),
        ),
      }),
    )
    .optional(),
});

// ワークフローの入力スキーマ
const triggerSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  sourceIds: z.array(z.number()).describe('レビュー対象ソースのIDリスト'),
});

/**
 * レビュー実行ワークフロー
 */
export const reviewExecutionWorkflow = new Workflow({
  name: 'reviewExecutionWorkflow',
  triggerSchema,
});

// ステップ1: チェックリストをカテゴリごとに分類
const classifyChecklistsByCategoryStep = new Step({
  id: 'classifyChecklistsByCategoryStep',
  description: 'チェックリストをカテゴリごとに分類するステップ',
  outputSchema: classifyChecklistsByCategoryOutputSchema,
  execute: async ({ context }) => {
    // トリガーから入力を取得
    const { reviewHistoryId } = context.triggerData as z.infer<
      typeof triggerSchema
    >;

    // レビューリポジトリを取得
    const repository = getReviewRepository();

    try {
      // チェックリストを取得
      const checklistsResult = await repository.getChecklists(reviewHistoryId);
      if (!checklistsResult || checklistsResult.length === 0) {
        throw new Error('レビュー対象のチェックリストが見つかりません');
      }

      // チェックリストデータを整形
      const checklistData = checklistsResult.map((c) => ({
        id: c.id,
        content: c.content,
      }));

      // カテゴリ分類エージェントを使用して分類
      const classifiCategoryAgent = new Agent({
        name: 'classifyCategoryAgent',
        instructions: CHECKLIST_CATEGORY_CLASSIFICATION_SYSTEM_PROMPT,
        model: openAICompatibleModel(),
      });
      const outputSchema = z.object({
        categories: z
          .array(
            z.object({
              name: z.string().describe('Category name'),
              checklistIds: z
                .array(z.number())
                .describe('Array of checklist IDs belonging to the category'),
            }),
          )
          .describe('Classified categories'),
      });
      // チェックリスト項目をカテゴリごとに分類
      const classificationResult = await classifiCategoryAgent.generate(
        `checklist items:
  ${checklistData.map((item) => `ID: ${item.id} - ${item.content}`).join('\n')}`,
        {
          output: outputSchema,
        },
      );
      // 分類結果の妥当性をチェック
      // 全てのチェックリストが分類されているか確認
      const classifiedChecklists = classificationResult.object.categories;
      if (!classifiedChecklists || classifiedChecklists.length === 0) {
        throw new Error('チェックリストの分類に失敗しました');
      }
      const checklistIds = new Set(checklistData.map((c) => c.id));
      const categorizedChecklistIds = new Set(
        classifiedChecklists.flatMap((c) => c.checklistIds),
      );
      // 分類されていないチェックリストを「その他」カテゴリに追加
      const uncategorizedChecklistIds = Array.from(checklistIds).filter(
        (id) => !categorizedChecklistIds.has(id),
      );
      if (uncategorizedChecklistIds.length > 0) {
        classifiedChecklists.push({
          name: 'その他',
          checklistIds: uncategorizedChecklistIds,
        });
      }
      // 複数カテゴリに属するチェックリストは、最初のカテゴリにのみ属するようにする
      const seen = new Set<number>();
      const categories = classifiedChecklists.map(
        ({ name, checklistIds: cIds }) => {
          // そのカテゴリで初めて現れるIDだけを取り出す
          const uniqueIds = cIds.filter((id) => !seen.has(id));
          uniqueIds.forEach((id) => seen.add(id));
          // content をつけたオブジェクトに変換
          const checklists = uniqueIds.map((id) => {
            const item = checklistData.find((c) => c.id === id)!;
            return { id: item.id, content: item.content };
          });
          return { name, checklists };
        },
      );
      return {
        status: 'success' as stepStatus,
        categories,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      return {
        status: 'failed' as stepStatus,
        errorMessage: `ドキュメントレビュー実行時にエラーが発生しました: ${errorMessage}`,
      };
    }
  },
});

// ステップ2: チェックリストごとにレビューを実行
const reviewExecutionStep = new Step({
  id: 'reviewExecutionStep',
  description: 'チェックリストごとにレビューを実行するステップ',
  outputSchema: baseStepOutputSchema,
  execute: async ({ context }) => {
    // レビュー対象のソースID
    const { sourceIds } = context.triggerData as z.infer<typeof triggerSchema>;
    // ステップ1からの入力を取得
    const { categories } = context.getStepResult(
      'classifyChecklistsByCategoryStep',
    )! as z.infer<typeof classifyChecklistsByCategoryOutputSchema>;

    // リポジトリを取得
    const reviewRepository = getReviewRepository();
    const sourceRepository = getSourceRepository();

    // チェックリストを全量チェックできなかったドキュメントを格納
    // key: ファイル名, value: エラー内容
    const errorDocuments = new Map<string, string[]>();

    try {
      const reviewAgent = new Agent({
        name: 'reviewAgent',
        instructions: '',
        model: openAICompatibleModel(),
      });

      // 各カテゴリ、ソースごとにレビューを実行
      for (const category of categories!) {
        for (const sourceId of sourceIds) {
          // ソースの内容を取得
          const source = await sourceRepository.getSourceById(sourceId);
          if (!source) {
            throw new Error(`ソースID ${sourceId} が見つかりません`);
          }
          const { content } = await FileExtractor.extractText(source.path);
          // レビューを実行(各カテゴリ内のチェックリストは一括でレビュー)
          // レビュー結果に含まれなかったチェックリストは再度レビューを実行する（最大試行回数は3回）
          const maxAttempts = 3;
          let attempt = 0;
          let reviewTargetChecklists = category.checklists;
          while (attempt < maxAttempts) {
            try {
              const outputSchema = z.array(
                z.object({
                  checklistId: z.number(),
                  evaluation: z.enum(['A', 'B', 'C']).describe('evaluation'),
                  comment: z.string().describe('evaluation comment'),
                }),
              );
              // レビューエージェントを使用してレビューを実行
              const reviewResult = await reviewAgent.generate(content, {
                output: outputSchema,
                instructions: getDocumentReviewExecutionPrompt(
                  reviewTargetChecklists,
                ),
              });
              // レビュー結果をDBに保存
              await reviewRepository.upsertReviewResult(
                reviewResult.object.map((result) => ({
                  reviewChecklistId: result.checklistId,
                  sourceId,
                  evaluation: result.evaluation as ReviewEvaluation,
                  comment: result.comment,
                })),
              );
              // レビュー結果に含まれなかったチェックリストを抽出
              const reviewedChecklistIds = new Set(
                reviewResult.object.map((result) => result.checklistId),
              );
              reviewTargetChecklists = reviewTargetChecklists.filter(
                (checklist) => !reviewedChecklistIds.has(checklist.id),
              );
              if (reviewTargetChecklists.length === 0) {
                // 全てのチェックリストがレビューされた場合、成功
                break;
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : '不明なエラー';
              // レビューに失敗したチェックリストを記録
              if (!errorDocuments.has(path.basename(source.path))) {
                errorDocuments.set(path.basename(source.path), []);
              }
              errorDocuments
                .get(path.basename(source.path))!
                .push(errorMessage);
            } finally {
              attempt += 1;
            }
          }
          if (attempt >= maxAttempts) {
            // 最大試行回数に達した場合、レビューに失敗したドキュメントを記録
            if (!errorDocuments.has(path.basename(source.path))) {
              errorDocuments.set(path.basename(source.path), []);
            }
            errorDocuments
              .get(path.basename(source.path))!
              .push(
                `最大試行回数(${maxAttempts})内で全てのチェックリストに対してレビューが完了しませんでした`,
              );
          }
        }
      }
      // errorDocumentsが空でない場合、レビューに失敗したドキュメントを返す
      if (errorDocuments.size > 0) {
        const errorMessage = `以下ドキュメントのレビュー中にエラーが発生しました:
        ${Array.from(errorDocuments.entries())
          .map(
            ([fileName, errors]) =>
              `${fileName}:\n  - ${errors.join('\n  - ')}`,
          )
          .join('\n')}`;
        return {
          status: 'failed' as stepStatus,
          errorMessage,
        };
      }
      // 全てのレビューが成功した場合
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      return {
        status: 'failed' as stepStatus,
        errorMessage: `ドキュメントレビュー実行時にエラーが発生しました: ${errorMessage}`,
      };
    }
  },
});

// ワークフローを構築
// eslint-disable-next-line
reviewExecutionWorkflow
  .step(classifyChecklistsByCategoryStep)
  .then(reviewExecutionStep, {
    when: {
      'classifyChecklistsByCategoryStep.status': 'success',
    },
  })
  .commit();
