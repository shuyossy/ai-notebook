import type {
  TextExtractorType,
  TextExtractionFormatType,
  ExtractedImage,
} from '@/types';

/**
 * テキスト抽出結果
 */
export interface TextExtractionResult {
  /** 抽出されたテキスト */
  content: string;
  /** 抽出された画像データ（テキスト内に![image](referenceId)として埋め込まれる） */
  images: ExtractedImage[];
}

/**
 * 形式別テキスト抽出戦略インターフェース
 * Strategy Patternを採用し、拡張子ごとに複数の抽出方式を提供可能
 */
export interface ITextExtractorStrategy {
  /**
   * この戦略がサポートする拡張子を取得
   */
  getSupportedExtensions(): string[];

  /**
   * この戦略の識別子を取得
   */
  getStrategyType(): TextExtractorType;

  /**
   * この戦略のフォーマット識別子を取得
   */
  getFormatType(): TextExtractionFormatType;

  /**
   * ファイルパスからテキストを抽出
   * @param filePath ファイルパス
   */
  extract(filePath: string): Promise<TextExtractionResult>;
}
