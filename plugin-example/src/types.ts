// プラグインインターフェース型定義
// 注: これらの型は本体アプリケーションからコピーされたものです

export type ExtractedDocument = {
  id: string;
  cacheId?: number;
  name: string;
  path: string;
  type: string;
  processMode?: 'text' | 'image';
  imageMode?: 'merged' | 'pages';
  textContent?: string;
  imageData?: string[];
};

export type CustomEvaluationSettings = {
  items: Array<{
    label: string;
    description: string;
  }>;
};

/**
 * 少量レビュー前のドキュメントフィルタリング・前処理を行うフック
 */
export type DocumentFilterHook = (context: {
  /** レビュー対象ドキュメント配列 */
  documents: ExtractedDocument[];
  /** チェックリスト項目配列 */
  checklists: Array<{ id: number; content: string }>;
  /** ユーザーからの追加指示 */
  additionalInstructions?: string;
  /** コメントフォーマット指定 */
  commentFormat?: string;
  /** カスタム評価設定 */
  evaluationSettings?: CustomEvaluationSettings;
}) => ExtractedDocument[] | Promise<ExtractedDocument[]>;

/**
 * 大量レビュー時の個別ドキュメントフィルタリング・前処理を行うフック
 */
export type SingleDocumentFilterHook = (context: {
  /** レビュー対象ドキュメント */
  document: ExtractedDocument;
  /** チェックリスト項目配列 */
  checklists: Array<{ id: number; content: string }>;
  /** ユーザーからの追加指示 */
  additionalInstructions?: string;
  /** コメントフォーマット指定 */
  commentFormat?: string;
}) => ExtractedDocument | null | Promise<ExtractedDocument | null>;

/**
 * 大量ドキュメントレビュー時のカスタム分割戦略を提供するフック
 */
export type ChunkStrategyHook = (context: {
  /** 分割対象ドキュメント */
  document: ExtractedDocument;
  /** 分割数 */
  splitCount: number;
  /** リトライ回数（コンテキスト長エラー時に増加） */
  retryCount: number;
}) =>
  | Array<{ start: number; end: number }>
  | Promise<Array<{ start: number; end: number }>>;

/**
 * レビュープラグインのインターフェース
 */
export interface ReviewPlugin {
  /** プラグイン名 */
  name: string;
  /** プラグインバージョン */
  version: string;
  /** プラグインで提供するフック */
  hooks?: {
    /** 少量ドキュメントレビュー実行前のドキュメントフィルタリング・前処理フック */
    beforeSmallDocumentReview?: DocumentFilterHook;
    /** 大量ドキュメントレビュー時の個別ドキュメント処理前のフィルタリング・前処理フック */
    beforeLargeDocumentReview?: SingleDocumentFilterHook;
    /** 大量ドキュメントレビュー時のカスタム分割戦略フック */
    chunkStrategy?: ChunkStrategyHook;
  };
}
