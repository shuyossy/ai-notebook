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
import { MAX_CATEGORIES, MAX_CHECKLISTS_PER_CATEGORY } from '.';
import { stepStatus } from '../../types';
import { splitChecklistEquallyByMaxSize } from '../lib';
import { createRuntimeContext } from '@/mastra/lib/agentUtils';
import { ClassifyCategoryAgentRuntimeContext } from '@/mastra/agents/workflowAgents';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

export const classifyChecklistsByCategoryInputSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
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
    const { reviewHistoryId } = inputData;

    // レビューリポジトリを取得
    const repository = getReviewRepository();

    try {
      // チェックリストを取得
      const checklistsResult = await repository.getChecklists(reviewHistoryId);
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

      // MAX_CHECKLISTS_PER_CATEGORY が1の場合は早期return
      if (MAX_CHECKLISTS_PER_CATEGORY <= 1) {
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistEquallyByMaxSize(
            checklistsResult,
            MAX_CHECKLISTS_PER_CATEGORY,
          ),
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
          abortSignal,
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
      logger.error(error, 'チェックリストのカテゴリ分類処理に失敗しました');
      if (
        extractAIAPISafeError(error) ||
        NoObjectGeneratedError.isInstance(error) ||
        error instanceof MastraError
      ) {
        // APIコールエラーまたはAIモデルが生成できる文字数を超えた場合、手動でカテゴリー分割
        // AIモデルが生成できる文字数を超えているため、手動でカテゴリー分割
        const checklistsResult =
          await repository.getChecklists(reviewHistoryId);
        return {
          status: 'success' as stepStatus,
          categories: splitChecklistEquallyByMaxSize(
            checklistsResult,
            MAX_CHECKLISTS_PER_CATEGORY,
          ),
        };
      }
      const normalizedError = normalizeUnknownError(error);
      const errorDetail = normalizedError.message;
      // エラーが発生した場合はエラーメッセージを設定
      const errorMessage = `${errorDetail}`;
      return bail({
        status: 'failed' as stepStatus,
        errorMessage,
      });
    }
  },
});
