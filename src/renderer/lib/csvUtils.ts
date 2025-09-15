import { ReviewChecklistResult } from '@/types';

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
 * レビュー結果データをCSV形式に変換
 */
export const convertReviewResultsToCSV = (
  checklistResults: ReviewChecklistResult[],
): string => {
  if (!checklistResults || checklistResults.length === 0) {
    return 'チェックリスト\n';
  }

  // ユニークなソースファイルを抽出
  const uniqueSources = new Map<string, { id: string; fileName: string }>();
  checklistResults.forEach((checklist) => {
    checklist.sourceEvaluations?.forEach((ev) => {
      if (!uniqueSources.has(ev.fileId)) {
        uniqueSources.set(ev.fileId, {
          id: ev.fileId,
          fileName: ev.fileName,
        });
      }
    });
  });

  const sources = Array.from(uniqueSources.values());

  // ヘッダー行を構築
  const headers = ['チェックリスト'];
  sources.forEach((source) => {
    headers.push(`${source.fileName}_評価`);
    headers.push(`${source.fileName}_コメント`);
  });

  const csvRows: string[] = [];

  // ヘッダー行を追加
  csvRows.push(headers.map(escapeCSVField).join(','));

  // データ行を追加
  checklistResults.forEach((checklist) => {
    const row: string[] = [checklist.content];

    sources.forEach((source) => {
      const evaluation = checklist.sourceEvaluations?.find(
        (ev) => ev.fileId === source.id,
      );

      // 評価値
      row.push(evaluation?.evaluation || '');
      // コメント
      row.push(evaluation?.comment || '');
    });

    csvRows.push(row.map(escapeCSVField).join(','));
  });

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
