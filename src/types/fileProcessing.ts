/**
 * ファイル処理に関する共通型定義
 * ドキュメント登録機能とドキュメントレビュー機能で共通利用する
 */

// ドキュメント処理方式
export type ProcessMode = 'text' | 'image';

// 画像化方式
export type ImageMode = 'merged' | 'pages';

// 一括設定用の処理モード
export type BulkProcessMode = 'text' | 'image-merged' | 'image-pages';

// 変換進捗情報
export interface ConversionProgress {
  currentFileName: string;
  conversionType: 'pdf' | 'image';
  currentIndex: number;
  totalCount: number;
  progressDetail?: {
    type: 'sheet-setup' | 'pdf-export';
    sheetName?: string;
    currentSheet?: number;
    totalSheets?: number;
  };
}

// 画像化対応ファイルのMIMEタイプ
export const IMAGE_PROCESSABLE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

// 画像化対応判定関数
export const supportsImageProcessing = (mimeType: string): boolean => {
  return (IMAGE_PROCESSABLE_MIME_TYPES as readonly string[]).includes(mimeType);
};
