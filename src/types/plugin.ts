import type { extractedDocumentSchema } from '../mastra/workflows/sourceReview/executeReview/schema';
import type { z } from 'zod';
import type { CustomEvaluationSettings } from './review';

// ExtractedDocumentの型を推論
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;

/**
 * 少量レビュー前のドキュメントフィルタリング・前処理を行うフック
 * @param context - フックのコンテキスト
 * @returns フィルタリング・前処理後のドキュメント配列
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
 * @param context - フックのコンテキスト
 * @returns フィルタリング・前処理後のドキュメント（nullの場合はスキップ）
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
 * @param context - フックのコンテキスト
 * @returns ドキュメント分割範囲の配列
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

/**
 * プラグイン情報（ロード済みプラグインのメタデータ）
 */
export interface PluginInfo {
  /** プラグイン名 */
  name: string;
  /** プラグインバージョン */
  version: string;
  /** プラグインファイルパス */
  filePath: string;
  /** 利用可能なフック名の配列 */
  availableHooks: string[];
}
