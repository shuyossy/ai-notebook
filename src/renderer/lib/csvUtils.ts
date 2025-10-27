import {
  ReviewChecklistResult,
  CustomEvaluationSettings,
  RevieHistory,
} from '@/types';

/**
 * CSV用文字列のエスケープ処理
 * - ダブルクォートを二重にエスケープ
 * - 改行、カンマ、クォートが含まれる場合は全体をクォートで囲む
 */
const escapeCSVField = (field: string): string => {
  if (field == null) return '';

  const stringField = String(field);

  // ダブルクォートをエスケープ
  const escaped = stringField.replace(/"/g, '""');

  // 改行、カンマ、ダブルクォートが含まれる場合はクォートで囲む
  if (
    escaped.includes(',') ||
    escaped.includes('\n') ||
    escaped.includes('\r') ||
    escaped.includes('"')
  ) {
    return `"${escaped}"`;
  }

  return escaped;
};

/**
 * レビュー結果データを新フォーマットのCSV形式に変換
 * チェックリスト、評定結果、レビュー結果、評定設定、追加指示、コメントフォーマット、AI API設定を含める
 */
export const convertReviewResultsToCSV = (
  checklistResults: ReviewChecklistResult[],
  reviewHistory?: RevieHistory | null,
  apiSettings?: { url?: string; key?: string; model?: string },
): string => {
  // ヘッダー行を構築
  const headers = [
    'チェックリスト',
    '評定結果',
    'レビュー結果',
    '評定ラベル',
    '評定説明',
    '追加指示',
    'コメントフォーマット',
    'AI APIエンドポイント',
    'AI APIキー',
    'BPR ID',
  ];

  const csvRows: string[] = [];

  // ヘッダー行を追加
  csvRows.push(headers.map(escapeCSVField).join(','));

  // 評定設定を取得
  const evaluationItems = reviewHistory?.evaluationSettings?.items || [];

  // チェックリスト数と評定設定数の最大値を取得
  const maxRows = Math.max(checklistResults.length, evaluationItems.length);

  // データ行を構築
  for (let i = 0; i < maxRows; i++) {
    const checklist = i < checklistResults.length ? checklistResults[i] : null;
    const evaluationItem = i < evaluationItems.length ? evaluationItems[i] : null;

    const row: string[] = [
      checklist?.content || '', // チェックリスト
      checklist?.sourceEvaluation?.evaluation || '', // 評定結果（新規追加）
      checklist?.sourceEvaluation?.comment || '', // レビュー結果（新規追加）
      evaluationItem?.label || '', // 評定ラベル
      evaluationItem?.description || '', // 評定説明
      i === 0 ? (reviewHistory?.additionalInstructions || '') : '', // 追加指示（1行目のみ）
      i === 0 ? (reviewHistory?.commentFormat || '') : '', // コメントフォーマット（1行目のみ）
      i === 0 ? (apiSettings?.url || '') : '', // AI APIエンドポイント（1行目のみ）
      i === 0 ? (apiSettings?.key || '') : '', // AI APIキー（1行目のみ）
      i === 0 ? (apiSettings?.model || '') : '', // BPR ID（1行目のみ）
    ];

    csvRows.push(row.map(escapeCSVField).join(','));
  }

  return csvRows.join('\n');
};

/**
 * CSVファイルをダウンロード
 */
export const downloadCSV = (csvContent: string, filename: string): void => {
  // UTF-8 BOMを追加してExcelで正しく表示されるように
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;

  const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // クリーンアップ
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 現在の日時を使ってCSVファイル名を生成
 */
export const generateCSVFilename = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `レビュー結果_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.csv`;
};
