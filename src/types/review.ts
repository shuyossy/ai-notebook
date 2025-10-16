export interface RevieHistory {
  id: string; // reviewHistoriesのid
  title: string;
  targetDocumentName?: string | null; // レビュー対象の統合ドキュメント名
  additionalInstructions: string | null;
  commentFormat?: string | null;
  evaluationSettings?: CustomEvaluationSettings | null; // カスタム評定項目設定
  processingStatus: ProcessingStatus; // 処理ステータス
  createdAt: string;
  updatedAt: string;
}

export interface ReviewChecklist {
  id: number;
  reviewHistoryId: string;
  content: string;
  evaluation?: ReviewEvaluation | null; // A, B, C, - 評価
  comment?: string | null; // レビューコメント
  createdBy: ReviewChecklistCreatedBy;
  createdAt: string;
  updatedAt: string;
}

// カスタム評定項目の型定義
export interface EvaluationItem {
  label: string; // 評定ラベル（例: '優秀', '良好', '要改善', '対象外'）
  description: string; // 評定の説明
}

// カスタム評定項目設定の型定義
export interface CustomEvaluationSettings {
  items: EvaluationItem[];
}

// 動的評価型の型定義（カスタム評定項目対応）
export type ReviewEvaluation = string;

// チェックリストの作成元
export type ReviewChecklistCreatedBy = 'user' | 'system';

// 最終的に画面に表示するチェックリストの型
export type ReviewChecklistResult = {
  id: number; // チェックリストのID
  content: string;
  sourceEvaluation?: {
    evaluation?: ReviewEvaluation; // カスタム評定項目対応
    comment?: string;
  };
};

// チェックリストの編集内容を表す型
export type ReviewChecklistEdit = {
  id: number | null; // 新規作成時はnull
  content?: string; // 削除の場合は指定不要
  delete?: boolean; // trueの場合は削除対象
};

export type ModalMode = 'extract' | 'review';

export type DocumentType = 'checklist-ai' | 'checklist-csv' | 'general';

// ドキュメント処理方式の定義（PDF, Word, Excel, PowerPoint対応）
export type ProcessMode = 'text' | 'image';

// ドキュメント画像化方式の定義
export type ImageMode = 'merged' | 'pages';

// ドキュメントレビューのモード定義
export type DocumentMode = 'small' | 'large';

// アップロードファイル情報の型定義
export interface UploadFile {
  id: string;
  name: string;
  path: string;
  type: string;
  processMode?: ProcessMode; // ドキュメントファイル（PDF, Office）の処理方式
  imageMode?: ImageMode; // 画像化の場合のモード (merged: 統合画像, pages: ページ別画像)
  imageData?: string[]; // 画像変換時のBase64データ配列 (merged: 長さ1, pages: 各ページ)
}

export type ChecklistExtractionResultStatus =
  | 'success'
  | 'failed'
  | 'suspended'
  | 'canceled';

export type ReviewExecutionResultStatus =
  | 'success'
  | 'failed'
  | 'suspended'
  | 'canceled';

// 処理ステータスの型定義
export type ProcessingStatus =
  | 'idle'              // アイドル状態
  | 'extracting'        // チェックリスト抽出中
  | 'canceling-extract' // チェックリスト抽出のキャンセル処理中
  | 'extracted'         // チェックリスト抽出完了
  | 'reviewing'         // レビュー実行中
  | 'canceling-review'  // レビュー実行のキャンセル処理中
  | 'completed';        // レビュー完了

// レビュードキュメントキャッシュ（サービス層で使用）
export interface ReviewDocumentCache {
  id: number;
  reviewHistoryId: string;
  fileName: string; // ワークフロー内での名前（分割時は "xxx (part 1)" など）
  processMode: ProcessMode;
  textContent?: string; // processMode='text'の場合
  imageData?: string[]; // processMode='image'の場合
  createdAt: string;
  updatedAt: string;
}

// レビュー大量ドキュメント結果キャッシュ（大量ドキュメントレビューの個別レビュー結果）
export interface ReviewLargedocumentResultCache {
  reviewDocumentCacheId: number;
  reviewChecklistId: number;
  comment: string;
  totalChunks: number; // ドキュメント分割総数
  chunkIndex: number; // 何番目のチャンクか（0から始まる）
  individualFileName: string; // 分割後の個別ドキュメント名（"xxx (part 1)" など）
}
