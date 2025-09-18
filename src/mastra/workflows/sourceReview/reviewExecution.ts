import { NoObjectGeneratedError } from 'ai';
// @ts-ignore
import { createWorkflow, createStep } from '@mastra/core/workflows';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { z } from 'zod';
import { getReviewRepository } from '@/main/repository/reviewRepository';
import type { ReviewEvaluation } from '@/types';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import { splitChecklistEquallyByMaxSize } from './lib';
import {
  ClassifyCategoryAgentRuntimeContext,
  ReviewExecuteAgentRuntimeContext,
} from '../../agents/workflowAgents';
import { createRuntimeContext, judgeFinishReason } from '../../lib/agentUtils';
import { getMainLogger } from '@/main/lib/logger';
import { createCombinedMessage } from '../../lib/util';
import {
  normalizeUnknownError,
  extractAIAPISafeError,
  internalError,
} from '@/main/lib/error';
import { createHash } from 'crypto';

const logger = getMainLogger();

// 一つのカテゴリに含めるチェックリストの最大数
const MAX_CHECKLISTS_PER_CATEGORY = 3;
// 分割カテゴリの最大数
const MAX_CATEGORIES = 20;

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
  files: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        path: z.string(),
        type: z.string(),
        pdfProcessMode: z.enum(['text', 'image']).optional(),
        pdfImageMode: z.enum(['merged', 'pages']).optional(),
        imageData: z.array(z.string()).optional(),
      }),
    )
    .describe('アップロードファイルのリスト'),
  additionalInstructions: z
    .string()
    .optional()
    .describe('レビューに対する追加指示'),
  commentFormat: z
    .string()
    .optional()
    .describe('レビューコメントのフォーマット'),
  evaluationSettings: z
    .object({
      items: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
        }),
      ),
    })
    .optional()
    .describe('カスタム評定項目設定'),
});

// ステップ1: チェックリストをカテゴリごとに分類
const classifyChecklistsByCategoryStep = createStep({
  id: 'classifyChecklistsByCategoryStep',
  description: 'チェックリストをカテゴリごとに分類するステップ',
  inputSchema: triggerSchema,
  outputSchema: classifyChecklistsByCategoryOutputSchema,
  execute: async ({ inputData, mastra, abortSignal }) => {
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
      // エラーが発生した場合はエラ
      const errorMessage = `${errorDetail}`;
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
  execute: async ({ inputData, getInitData, mastra, abortSignal, bail }) => {
    // レビュー対象のファイル
    const { files, additionalInstructions, commentFormat, evaluationSettings } =
      getInitData() as z.infer<typeof triggerSchema>;
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

    try {
      const reviewAgent = mastra.getAgent('reviewExecuteAgent');

      // 複数ファイルを統合してメッセージを作成（一度だけ）
      const message = await createCombinedMessage(
        files,
        'Please review this document against the provided checklist items',
      );

      // 各カテゴリごとに統合されたファイル内容をレビューする
      for (const category of categories!) {
        // レビューを実行(各カテゴリ内のチェックリストは一括でレビュー)
        // レビュー結果に含まれなかったチェックリストは再度レビューを実行する（最大試行回数は3回）
        const maxAttempts = 3;
        let attempt = 0;
        let reviewTargetChecklists = category.checklists;
        while (attempt < maxAttempts) {
          // デフォルトの評定項目
          const defaultEvaluationItems = ['A', 'B', 'C', '-'] as const;

          // カスタム評定項目がある場合はそれを使用、なければデフォルトを使用
          const evaluationItems = evaluationSettings?.items?.length
            ? evaluationSettings.items.map((item) => item.label)
            : defaultEvaluationItems;

          // 最初の要素が存在することを確認してenumを作成
          const evaluationEnum =
            evaluationItems.length > 0
              ? z.enum([evaluationItems[0], ...evaluationItems.slice(1)] as [
                  string,
                  ...string[],
                ])
              : z.enum(defaultEvaluationItems);

          const outputSchema = z.array(
            z.object({
              checklistId: z.number(),
              comment: z.string().describe('evaluation comment'),
              evaluation: evaluationEnum.describe('evaluation'),
            }),
          );
          const runtimeContext =
            await createRuntimeContext<ReviewExecuteAgentRuntimeContext>();
          runtimeContext.set('checklistItems', reviewTargetChecklists);
          runtimeContext.set('additionalInstructions', additionalInstructions);
          runtimeContext.set('commentFormat', commentFormat);
          runtimeContext.set('evaluationSettings', evaluationSettings);
          // レビューエージェントを使用してレビューを実行
          const reviewResult = await reviewAgent.generate(message, {
            output: outputSchema,
            runtimeContext,
            abortSignal,
          });
          const { success, reason } = judgeFinishReason(
            reviewResult.finishReason,
          );
          if (!success) {
            throw internalError({
              expose: true,
              messageCode: 'AI_API_ERROR',
              messageParams: { detail: reason },
            });
          }
          // レビュー結果をDBに保存（複数ファイルの情報を統合）
          if (reviewResult.object && Array.isArray(reviewResult.object)) {
            const combinedFileIds = files.map((f) => f.id).join('/');
            const idsHash = createHash('md5')
              .update(combinedFileIds)
              .digest('hex');
            const combinedFileNames = files.map((f) => f.name).join('/');
            await reviewRepository.upsertReviewResult(
              reviewResult.object.map((result) => ({
                reviewChecklistId: result.checklistId,
                evaluation: result.evaluation as ReviewEvaluation,
                comment: result.comment,
                fileId: idsHash,
                fileName: combinedFileNames,
              })),
            );
          }
          // レビュー結果に含まれなかったチェックリストを抽出
          const reviewedChecklistIds = new Set(
            reviewResult.object && Array.isArray(reviewResult.object)
              ? reviewResult.object.map((result) => result.checklistId)
              : [],
          );
          reviewTargetChecklists = reviewTargetChecklists.filter(
            (checklist) => !reviewedChecklistIds.has(checklist.id),
          );
          if (reviewTargetChecklists.length === 0) {
            // 全てのチェックリストがレビューされた場合、成功
            break;
          }
          attempt += 1;
        }
        if (attempt >= maxAttempts) {
          // 最大試行回数に達した場合、レビューに失敗したドキュメントを記録
          bail({
            status: 'failed' as stepStatus,
            errorMessage:
              '全てのチェックリストに対してレビューを完了することができませんでした\nもう一度お試しください',
          });
        }
      }
      // 全てのレビューが成功した場合
      return {
        status: 'success' as stepStatus,
        output: {
          success: true,
        },
      };
    } catch (error) {
      logger.error(error, 'チェックリストのレビュー実行処理に失敗しました');
      let errorMessage: string;
      if (
        NoObjectGeneratedError.isInstance(error) &&
        error.finishReason === 'length'
      ) {
        // AIモデルが生成できる文字数を超えているため、手動でレビューを分割
        errorMessage = `AIモデルが生成できる文字数を超えています。チェックリスト量の削減を検討してください。`;
      } else {
        const normalizedError = normalizeUnknownError(error);
        errorMessage = normalizedError.message;
      }
      // エラーが発生した場合はエラー情報を返す
      return {
        status: 'failed' as stepStatus,
        errorMessage,
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
