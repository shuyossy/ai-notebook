import { APICallError, NoObjectGeneratedError } from 'ai';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { MastraError } from '@mastra/core/error';
import { z } from 'zod';
import path from 'path';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import FileExtractor from '../../../main/utils/fileExtractor';
import type { ReviewEvaluation } from '../../../main/types';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import { splitChecklistEquallyByMaxSize } from './lib';
import {
  ClassifyCategoryAgentRuntimeContext,
  ReviewExecuteAgentRuntimeContext,
} from '../../agents/workflowAgents';
import { createRuntimeContext, judgeFinishReason } from '../../agents/lib';

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

// ステップ1: チェックリストをカテゴリごとに分類
const classifyChecklistsByCategoryStep = createStep({
  id: 'classifyChecklistsByCategoryStep',
  description: 'チェックリストをカテゴリごとに分類するステップ',
  inputSchema: triggerSchema,
  outputSchema: classifyChecklistsByCategoryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    // トリガーから入力を取得
    const { reviewHistoryId } = inputData;

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
      const classifiCategoryAgent = mastra.getAgent('classifyCategoryAgent');
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
      const runtimeContext =
        createRuntimeContext<ClassifyCategoryAgentRuntimeContext>();
      runtimeContext.set(
        'maxChecklistsPerCategory',
        MAX_CHECKLISTS_PER_CATEGORY,
      );
      runtimeContext.set('maxCategories', MAX_CATEGORIES);
      // チェックリスト項目をカテゴリごとに分類
      const classificationResult = await classifiCategoryAgent.generate(
        `checklist items:
  ${checklistData.map((item) => `ID: ${item.id} - ${item.content}`).join('\n')}`,
        {
          output: outputSchema,
          runtimeContext,
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

        // ── MAX_CHECKLISTS_PER_CATEGORY件ずつチャンクに分けてサブカテゴリ化 ────────────
        for (
          let i = 0;
          i < filteredIds.length;
          i += MAX_CHECKLISTS_PER_CATEGORY
        ) {
          const chunkIds = filteredIds.slice(
            i,
            i + MAX_CHECKLISTS_PER_CATEGORY,
          );
          const chunkName =
            i === 0
              ? name
              : `${name} (Part ${Math.floor(i / MAX_CHECKLISTS_PER_CATEGORY) + 1})`;

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
      if (
        APICallError.isInstance(error) ||
        (NoObjectGeneratedError.isInstance(error) &&
          error.finishReason === 'length') ||
        error instanceof MastraError
      ) {
        // APIコールエラーまたはAIモデルが生成できる文字数を超えた場合、手動でカテゴリー分割
        // AIモデルが生成できる文字数を超えているため、手動でカテゴリー分割
        const checklistsResult =
          await repository.getChecklists(reviewHistoryId);
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistEquallyByMaxSize(checklistsResult, 7),
        };
      }
      const errorDetail =
        error instanceof Error ? error.message : JSON.stringify(error);
      // エラーが発生した場合はエラ
      const errorMessage = `ドキュメントレビュー中にエラーが発生しました:\n${errorDetail}`;
      return {
        status: 'failed' as stepStatus,
        errorMessage,
      };
    }
  },
});

// ステップ2: チェックリストごとにレビューを実行
const reviewExecutionStep = createStep({
  id: 'reviewExecutionStep',
  description: 'チェックリストごとにレビューを実行するステップ',
  inputSchema: classifyChecklistsByCategoryOutputSchema,
  outputSchema: baseStepOutputSchema,
  execute: async ({ inputData, getInitData, mastra }) => {
    // レビュー対象のソースID
    const { sourceIds } = getInitData() as z.infer<typeof triggerSchema>;
    // ステップ1からの入力を取得
    const { categories } = inputData;

    // ステップ1でfailedした場合はそのまま返す
    if (inputData.status === 'failed') {
      return {
        status: 'failed' as stepStatus,
        errorMessage: inputData.errorMessage,
      };
    }

    // リポジトリを取得
    const reviewRepository = getReviewRepository();
    const sourceRepository = getSourceRepository();

    // チェックリストを全量チェックできなかったドキュメントを格納
    // key: ファイル名, value: エラー内容
    const errorDocuments = new Map<string, string[]>();

    try {
      const reviewAgent = mastra.getAgent('reviewExecuteAgent');

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
              const runtimeContext =
                createRuntimeContext<ReviewExecuteAgentRuntimeContext>();
              runtimeContext.set('checklistItems', reviewTargetChecklists);
              // レビューエージェントを使用してレビューを実行
              const reviewResult = await reviewAgent.generate(content, {
                output: outputSchema,
                runtimeContext,
              });
              const { success, reason } = judgeFinishReason(
                reviewResult.finishReason,
              );
              if (!success) {
                throw new Error(reason);
              }
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
              if (
                error instanceof MastraError &&
                APICallError.isInstance(error.cause)
              ) {
                // APIコールエラーの場合はresponseBodyの内容を取得
                errorDetail = error.cause.message;
                if (error.cause.responseBody) {
                  errorDetail += `:\n${error.cause.responseBody}`;
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

/**
 * レビュー実行ワークフロー
 */
export const reviewExecutionWorkflow = createWorkflow({
  id: 'reviewExecutionWorkflow',
  inputSchema: triggerSchema,
  // ドキュメントには最終ステップの出力スキーマを指定すれば良いように記載があるが、実際の出力結果は{最終ステップ: outputSchema}となっている
  // Matraのバグ？
  outputSchema: baseStepOutputSchema,
  steps: [classifyChecklistsByCategoryStep, reviewExecutionStep],
})
  .then(classifyChecklistsByCategoryStep)
  .then(reviewExecutionStep)
  .commit();
