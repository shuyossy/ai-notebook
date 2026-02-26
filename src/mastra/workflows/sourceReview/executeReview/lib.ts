import { getReviewRepository } from '@/adapter/db';
import { logError } from '@/main/lib/logger';

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
