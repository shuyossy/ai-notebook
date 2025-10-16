/**
 * レビューチャットworkflowで利用するヘルパー関数
 */

import type { ReviewChecklistResult } from '@/types';

/**
 * チェックリスト結果と個別レビュー結果のデータ型
 */
export type ChecklistResultWithIndividualResults = {
  checklistResult: ReviewChecklistResult;
  individualResults?: Array<{
    documentId: number;
    comment: string;
    individualFileName: string;
  }>;
};

/**
 * レビューモードを判定する
 * @param checklistResults チェックリスト結果と個別レビュー結果の配列
 * @returns 'large' | 'small'
 */
export function judgeReviewMode(
  checklistResults: ChecklistResultWithIndividualResults[],
): 'large' | 'small' {
  const hasIndividualResults = checklistResults.some(
    (item) => item.individualResults && item.individualResults.length > 0,
  );
  return hasIndividualResults ? 'large' : 'small';
}

/**
 * レビュー計画用のチェックリスト情報を構築する
 * @param checklistResults チェックリスト結果と個別レビュー結果の配列
 * @returns チェックリスト情報のテキスト
 */
export function buildPlanningChecklistInfo(
  checklistResults: ChecklistResultWithIndividualResults[],
): string {
  return checklistResults
    .map((item) => {
      let info = `Checklist ID: ${item.checklistResult.id}\nContent: ${item.checklistResult.content}\n`;
      if (item.checklistResult.sourceEvaluation) {
        info += `Review Result:\n  Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}\n  Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}\n`;
      }
      if (item.individualResults && item.individualResults.length > 0) {
        info += `Individual Review Results:\n`;
        item.individualResults.forEach((result) => {
          info += `  - Document ID: ${result.documentId}\n    Document Name: ${result.individualFileName}\n    Comment: ${result.comment}\n`;
        });
      }
      return info;
    })
    .join('\n---\n');
}

/**
 * レビュー調査用のチェックリスト情報を構築する
 * @param checklistResults チェックリスト結果と個別レビュー結果の配列
 * @returns チェックリスト情報のテキスト
 */
export function buildResearchChecklistInfo(
  checklistResults: ChecklistResultWithIndividualResults[],
): string {
  return checklistResults
    .map((item) => {
      let info = `Checklist ID: ${item.checklistResult.id}\nContent: ${item.checklistResult.content}\n`;
      if (item.checklistResult.sourceEvaluation) {
        info += `Review Result:\n  Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}\n  Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}\n`;
      }
      if (item.individualResults && item.individualResults.length > 0) {
        info += `Individual Review Results:\n`;
        item.individualResults.forEach((result) => {
          info += `  - Document ID: ${result.documentId}\n    Document Name: ${result.individualFileName}\n    Comment: ${result.comment}\n`;
        });
      }
      return info;
    })
    .join('\n---\n');
}

/**
 * レビュー回答用のチェックリスト情報を構築する
 * @param checklistResults チェックリスト結果と個別レビュー結果の配列
 * @returns チェックリスト情報のテキスト
 */
export function buildAnswerChecklistInfo(
  checklistResults: ChecklistResultWithIndividualResults[],
): string {
  return checklistResults
    .map((item) => {
      let info = `Checklist: ${item.checklistResult.content}\n`;
      if (item.checklistResult.sourceEvaluation) {
        info += `Evaluation: ${item.checklistResult.sourceEvaluation.evaluation || 'N/A'}, Comment: ${item.checklistResult.sourceEvaluation.comment || 'N/A'}`;
      }
      return info;
    })
    .join('\n');
}
