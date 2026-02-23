import type { FileTextExtractionResult, TextExtractorType } from '@/types';

/**
 * ファイルテキスト抽出オーケストレーターインターフェース
 * 拡張子に応じた抽出戦略の選択とフォールバック・正規化を行う
 */
export interface IFileTextExtractor {
  /**
   * ファイルからテキストを抽出
   * @param filePath ファイルパス
   * @param fileName ファイル名（拡張子の判定に使用）
   */
  extract(
    filePath: string,
    fileName: string,
  ): Promise<FileTextExtractionResult>;

  /**
   * 指定した拡張子で利用可能な抽出方式一覧を取得
   */
  getAvailableStrategies(extension: string): TextExtractorType[];

  /**
   * サポートされている拡張子かどうかを判定
   */
  isSupported(extension: string): boolean;
}
