// レビュー評価の型定義
export type ReviewEvaluation = 'A' | 'B' | 'C' | '-';

// チェックリストの作成元
export type ReviewChecklistCreatedBy = 'user' | 'system';

// 最終的に画面に表示するチェックリストの型
export type ReviewChecklistResultDisplay = {
  id: number; // チェックリストのID
  content: string;
  sourceEvaluations?: {
    fileId: string;
    fileName: string;
    evaluation?: ReviewEvaluation;
    comment?: string;
  }[];
};

// チェックリストの編集内容を表す型
export type ReviewChecklistEdit = {
  id: number | null; // 新規作成時はnull
  content?: string; // 削除の場合は指定不要
  delete?: boolean; // trueの場合は削除対象
};

export type ModalMode = 'extract' | 'review';

// ドキュメント種別の定義
export type DocumentType = 'checklist' | 'general';

// PDF処理方式の定義
export type PdfProcessMode = 'text' | 'image';

// PDF画像化方式の定義
export type PdfImageMode = 'merged' | 'pages';

// アップロードファイル情報の型定義
export interface UploadFile {
  id: string;
  name: string;
  path: string;
  type: string;
  pdfProcessMode?: PdfProcessMode; // PDFファイルの場合のみ
  pdfImageMode?: PdfImageMode; // PDF画像化の場合のみ (merged: 統合画像, pages: ページ別画像)
  imageData?: string[]; // PDF画像変換時のBase64データ配列 (merged: 長さ1, pages: 各ページ)
}
