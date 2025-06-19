import { APICallError, NoObjectGeneratedError } from 'ai';
import { Workflow, Step } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import path from 'path';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import {
  getChecklistCategolizePrompt,
  getDocumentReviewExecutionPrompt,
} from '../../agents/prompts';
import FileExtractor from '../../../main/utils/fileExtractor';
import type { ReviewEvaluation } from '../../../main/types';
import { baseStepOutputSchema } from '../schema';
import openAICompatibleModel from '../../agents/model/openAICompatible';
import { stepStatus } from '../types';
import { splitChecklistEquallyByMaxSize } from './lib';

// 一つのカテゴリに含めるチェックリストの最大数
const MAX_CHECKLISTS_PER_CATEGORY = 7;
// 分割カテゴリの最大数
const MAX_CATEGORIES = 10;

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
        instructions: getChecklistCategolizePrompt(
          MAX_CHECKLISTS_PER_CATEGORY,
          MAX_CATEGORIES,
        ),
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
      const rawCategories = classificationResult.object.categories;
      if (!rawCategories || rawCategories.length === 0) {
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistEquallyByMaxSize(
            checklistsResult,
            MAX_CHECKLISTS_PER_CATEGORY,
          ),
        };
      }
      // 全IDセットと、AIが返したID一覧のセットを作成
      const allIds = new Set(checklistData.map((c) => c.id));
      const assignedIds = new Set(rawCategories.flatMap((c) => c.checklistIds));

      // 未分類アイテムがあれば「その他」カテゴリにまとめる
      const uncategorized = Array.from(allIds).filter(
        (id) => !assignedIds.has(id),
      );
      if (uncategorized.length > 0) {
        rawCategories.push({
          name: 'その他',
          checklistIds: uncategorized,
        });
      }

      const seen = new Set<number>();
      const finalCategories: {
        name: string;
        checklists: { id: number; content: string }[];
      }[] = [];

      for (const { name, checklistIds } of rawCategories) {
        // ── カテゴリ内の重複排除 ────────────────────────
        const uniqueInCategory = Array.from(new Set(checklistIds));

        // ── 他カテゴリですでに割り当て済みのIDを除外 ─────────
        const filteredIds = uniqueInCategory.filter((id) => !seen.has(id));
        filteredIds.forEach((id) => seen.add(id));

        // ── 7件ずつチャンクに分けてサブカテゴリ化 ────────────
        for (let i = 0; i < filteredIds.length; i += 7) {
          const chunkIds = filteredIds.slice(i, i + 7);
          const chunkName =
            i === 0 ? name : `${name} (Part ${Math.floor(i / 7) + 1})`;

          const checklists = chunkIds.map((id) => {
            const item = checklistData.find((c) => c.id === id)!;
            return { id: item.id, content: item.content };
          });

          finalCategories.push({ name: chunkName, checklists });
        }
      }

      return {
        status: 'success' as stepStatus,
        categories: finalCategories,
      };
    } catch (error) {
      let errorDetail: string;
      if (
        APICallError.isInstance(error) ||
        (NoObjectGeneratedError.isInstance(error) &&
          error.finishReason === 'length')
      ) {
        // APIコールエラーまたはAIモデルが生成できる文字数を超えた場合、手動でカテゴリー分割
        // AIモデルが生成できる文字数を超えているため、手動でカテゴリー分割
        const checklistsResult =
          await repository.getChecklists(reviewHistoryId);
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistEquallyByMaxSize(checklistsResult, 7),
        };
      } else if (error instanceof Error) {
        errorDetail = error.message;
      } else {
        errorDetail = JSON.stringify(error);
      }
      const errorMessage = `ドキュメントレビュー中にエラーが発生しました:\n${errorDetail}`;
      return {
        status: 'failed' as stepStatus,
        errorMessage,
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
                  evaluation: z
                    .enum(['A', 'B', 'C', '-'])
                    .describe('evaluation'),
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
              let errorDetail: string;
              if (APICallError.isInstance(error)) {
                // APIコールエラーの場合はresponseBodyの内容を取得
                errorDetail = error.message;
                if (error.responseBody) {
                  errorDetail += `:\n${error.responseBody}`;
                }
              } else if (
                NoObjectGeneratedError.isInstance(error) &&
                error.finishReason === 'length'
              ) {
                // AIモデルが生成できる文字数を超えているため、手動でレビューを分割
                errorDetail = `AIモデルが生成できる文字数を超えています。チェックリスト量の削減を検討してください。`;
              } else if (error instanceof Error) {
                errorDetail = error.message;
              } else {
                errorDetail = JSON.stringify(error);
              }
              // レビューに失敗したチェックリストを記録
              if (!errorDocuments.has(path.basename(source.path))) {
                errorDocuments.set(path.basename(source.path), []);
              }
              errorDocuments.get(path.basename(source.path))!.push(errorDetail);
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
                `全てのチェックリストに対してレビューを完了することができませんでした`,
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
        errorMessage: `ドキュメントレビュー中にエラーが発生しました: ${errorMessage}`,
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
