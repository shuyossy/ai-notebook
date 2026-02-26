import { getReviewRepository } from '@/adapter/db';
import { getMainLogger, logError } from '@/main/lib/logger';

export const getChecklistErrorMessage = (
  checklist: { id: number; content: string },
  errorMessage: string,
) => {
  return `・${checklist.content}:${errorMessage}`;
};

export const getChecklistsErrorMessage = (
  checklists: { id: number; content: string }[],
  errorMessage: string,
) => {
  return checklists
    .map((checklist) => getChecklistErrorMessage(checklist, errorMessage))
    .join('\n');
};

/**
 * AI応答配列からchecklistIdの重複を排除するユーティリティ関数
 * 最初の出現を保持し、重複を除外する
 */
export const deduplicateByChecklistId = <T extends { checklistId: number }>(
  items: T[],
): { deduplicated: T[]; duplicateIds: number[] } => {
  const seen = new Set<number>();
  const duplicateIds = new Set<number>();
  const deduplicated: T[] = [];

  for (const item of items) {
    if (seen.has(item.checklistId)) {
      duplicateIds.add(item.checklistId);
    } else {
      seen.add(item.checklistId);
      deduplicated.push(item);
    }
  }

  if (duplicateIds.size > 0) {
    getMainLogger().warn(
      `AI応答にchecklistIdの重複が検出されました: [${[...duplicateIds].join(', ')}]`,
    );
  }

  return { deduplicated, duplicateIds: [...duplicateIds] };
};

/**
 * チェックリストのエラーをDBに保存するヘルパー関数
 * ワークフローステップでチェックリスト単位のエラーが発生した場合に使用
 */
export const saveChecklistErrors = async (
  checklists: { id: number; content: string }[],
  errorMessage: string,
  documentOriginalName?: string,
): Promise<void> => {
  try {
    const reviewRepository = getReviewRepository();
    const formattedError = documentOriginalName
      ? `${documentOriginalName}の処理中にエラー:\n${errorMessage}`
      : errorMessage;
    await reviewRepository.upsertReviewErrors(
      checklists.map((c) => ({
        reviewChecklistId: c.id,
        errorMessage: formattedError,
        documentOriginalName,
      })),
    );
  } catch (err) {
    logError(err, 'チェックリストエラーのDB保存に失敗しました');
  }
};
