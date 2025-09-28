export type stepStatus = 'success' | 'failed';

// ドキュメント量選択タイプ
export type DocumentVolumeType = 'small' | 'large';

// ドキュメント情報（ワークフロー内で一意識別用のIDを追加）
export interface DocumentInfo {
  id: string;
  name: string;
  path: string;
  type: string;
  pdfProcessMode?: 'text' | 'image';
  pdfImageMode?: 'merged' | 'pages';
  imageData?: string[];
  workflowDocId?: string; // ワークフロー内での一時的なID
}

// ドキュメント要約情報
export interface DocumentSummary {
  workflowDocId: string;
  name: string;
  topics: string[];
  summary: string;
}

// ドキュメント要約レスポンス
export interface DocumentSummaryResponse {
  summaries: DocumentSummary[];
}
