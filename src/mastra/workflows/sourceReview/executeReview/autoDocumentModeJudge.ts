import { z } from 'zod';
// @ts-ignore
import type { Mastra } from '@mastra/core';
import { judgeErrorIsContentLengthError } from '@/mastra/lib/agentUtils';
import { extractedDocumentSchema } from './schema';
import { executeSmallDocumentReview } from './smallDocumentReviewStep';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

/**
 * ドキュメントモードを自動判定する関数
 *
 * 最もチェックリスト文字数が多いカテゴリを使って試行レビューを実行し、
 * コンテキスト長超過の有無によりsmall/largeを自動判定する。
 */
export async function determineDocumentMode(params: {
  mastra: Mastra;
  documents: Array<z.infer<typeof extractedDocumentSchema>>;
  categories: Array<{
    name: string;
    checklists: Array<{ id: number; content: string }>;
  }>;
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: { items: { label: string; description: string }[] };
  abortSignal?: AbortSignal;
}): Promise<'small' | 'large'> {
  const {
    mastra: mastraInstance,
    documents,
    categories,
    additionalInstructions,
    commentFormat,
    evaluationSettings,
    abortSignal,
  } = params;

  // カテゴリ内のチェックリスト文字数合計が最大のカテゴリを特定
  const largestCategory = categories.reduce((max, category) => {
    const totalLength = category.checklists.reduce(
      (sum, cl) => sum + cl.content.length,
      0,
    );
    const maxLength = max.checklists.reduce(
      (sum, cl) => sum + cl.content.length,
      0,
    );
    return totalLength > maxLength ? category : max;
  }, categories[0]);

  logger.info(
    `自動判定: 最大チェックリストカテゴリ「${largestCategory.name}」(${largestCategory.checklists.length}項目)で試行レビューを実行`,
  );

  try {
    const reviewAgent = mastraInstance.getAgent('reviewExecuteAgent');

    // 簡易outputSchema（試行目的のため最小限）
    const outputSchema = z.array(
      z.object({
        checklistId: z.number(),
        comment: z.string(),
        evaluation: z.string(),
      }),
    );

    // 共通関数を使用して試行レビューを実行
    await executeSmallDocumentReview({
      reviewAgent,
      documents,
      checklists: largestCategory.checklists,
      additionalInstructions,
      commentFormat,
      evaluationSettings,
      outputSchema,
      abortSignal,
    });

    // 成功 → smallモード
    logger.info('自動判定: 試行レビュー成功 → smallモードを選択');
    return 'small';
  } catch (error) {
    if (judgeErrorIsContentLengthError(error)) {
      // コンテキスト長超過 → largeモード
      logger.info('自動判定: コンテキスト長超過を検知 → largeモードを選択');
      return 'large';
    }
    // その他のエラー → throw（ワークフローのエラーハンドリングに委譲）
    throw error;
  }
}
