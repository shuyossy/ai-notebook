import { z } from 'zod';
import { baseStepOutputSchema } from '../../schema';
// @ts-ignore
import { createStep } from '@mastra/core';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { NoObjectGeneratedError } from 'ai';
import { getReviewRepository } from '@/adapter/db';
import {
  extractAIAPISafeError,
  internalError,
  normalizeUnknownError,
} from '@/main/lib/error';
import { stepStatus } from '../../types';
import { splitChecklistByFixedSize, consolidateCategories } from '../lib';
import {
  createRuntimeContext,
  getModelSpecificGenerateOptions,
} from '@/mastra/lib/agentUtils';
import { ClassifyCategoryAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { logError } from '@/main/lib/logger';
import { withAIControl } from '@/mastra/lib/withAIControl';

export const classifyChecklistsByCategoryInputSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  retryMode: z
    .enum(['all', 'uncompleted-only'])
    .optional()
    .describe(
      'リトライモード: all=全てのチェックリスト, uncompleted-only=未完了のみ',
    ),
  concurrentChecklistCount: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('一度にレビューするチェックリスト項目数'),
});

// カテゴリ分類ステップの出力スキーマ
export const classifyChecklistsByCategoryOutputSchema =
  baseStepOutputSchema.extend({
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

export const classifyChecklistsByCategoryStep = createStep({
  id: 'classifyChecklistsByCategoryStep',
  description: 'チェックリストをカテゴリごとに分類するステップ',
  inputSchema: classifyChecklistsByCategoryInputSchema,
  outputSchema: classifyChecklistsByCategoryOutputSchema,
  execute: async ({ inputData, mastra, abortSignal, bail }) => {
    // トリガーから入力を取得
    const { reviewHistoryId, retryMode, concurrentChecklistCount } = inputData;
    const targetChecklistCount = concurrentChecklistCount ?? 1;

    // レビューリポジトリを取得
    const repository = getReviewRepository();

    try {
      // リトライモードに応じてチェックリストを取得
      let checklistsResult;
      if (retryMode === 'uncompleted-only') {
        // 未完了のチェックリストのみ取得
        checklistsResult =
          await repository.getUncompletedChecklists(reviewHistoryId);
      } else {
        // 全てのチェックリストを取得（初回レビューまたは'all'リトライ）
        checklistsResult = await repository.getChecklists(reviewHistoryId);
      }

      if (!checklistsResult || checklistsResult.length === 0) {
        throw internalError({
          expose: true,
          messageCode: 'REVIEW_EXECUTION_NO_TARGET_CHECKLIST',
        });
      }

      // チェックリストデータを整形
      const checklistData = checklistsResult.map((c) => ({
        id: c.id,
        content: c.content,
      }));

      // 同時レビュー項目数が1の場合はAI分類不要、固定サイズ分割
      if (targetChecklistCount <= 1) {
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistByFixedSize(checklistData, 1),
        };
      }

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
        await createRuntimeContext<ClassifyCategoryAgentRuntimeContext>();
      runtimeContext.set('targetChecklistCount', targetChecklistCount);
      // チェックリスト項目をカテゴリごとに分類
      const classificationResult = await withAIControl(
        () =>
          classifiCategoryAgent.generateLegacy(
            `checklist items:
  ${checklistData.map((item) => `ID: ${item.id} - ${item.content}`).join('\n')}`,
            {
              output: outputSchema,
              runtimeContext,
              abortSignal,
              maxRetries: 0,
              ...getModelSpecificGenerateOptions(runtimeContext),
            },
          ),
        { abortSignal },
      );
      // 分類結果の妥当性をチェック
      const rawCategories = classificationResult.object.categories;
      if (!rawCategories || rawCategories.length === 0) {
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistByFixedSize(
            checklistData,
            targetChecklistCount,
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

      // AI分類結果を重複排除してchecklists形式に変換
      const seen = new Set<number>();
      const aiCategories: {
        name: string;
        checklists: { id: number; content: string }[];
      }[] = [];

      for (const { name, checklistIds } of rawCategories) {
        const uniqueInCategory = Array.from(new Set(checklistIds));
        const filteredIds = uniqueInCategory.filter((id) => !seen.has(id));
        filteredIds.forEach((id) => seen.add(id));

        const checklists = filteredIds.map((id) => {
          const item = checklistData.find((c) => c.id === id)!;
          return { id: item.id, content: item.content };
        });

        if (checklists.length > 0) {
          aiCategories.push({ name, checklists });
        }
      }

      // consolidateCategoriesで同時チェック項目数に合わせて統合
      const finalCategories = consolidateCategories(
        aiCategories,
        targetChecklistCount,
      );

      return {
        status: 'success' as stepStatus,
        categories: finalCategories,
      };
    } catch (error) {
      logError(error, 'チェックリストのカテゴリ分類処理に失敗しました', {
        reviewHistoryId,
      });
      if (
        extractAIAPISafeError(error) ||
        NoObjectGeneratedError.isInstance(error) ||
        error instanceof MastraError
      ) {
        // APIコールエラーまたはAIモデルが生成できる文字数を超えた場合、固定サイズ分割にフォールバック
        const checklistsResult =
          await repository.getChecklists(reviewHistoryId);
        const checklistData = checklistsResult.map((c) => ({
          id: c.id,
          content: c.content,
        }));
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistByFixedSize(
            checklistData,
            targetChecklistCount,
          ),
        };
      }
      const normalizedError = normalizeUnknownError(error);
      const errorDetail = normalizedError.message;
      const errorMessage = `${errorDetail}`;
      return bail({
        status: 'failed' as stepStatus,
        errorMessage,
      });
    }
  },
});
