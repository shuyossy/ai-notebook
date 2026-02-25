import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractFromTxt } from '../extractionUtils';

/**
 * プレーンテキストファイル用の抽出戦略
 * txt, csv, md ファイルに対応（formatTypeをコンストラクタで切り替え可能）
 */
export class TxtExtractorStrategy implements ITextExtractorStrategy {
  private readonly formatType: TextExtractionFormatType;

  constructor(formatType: TextExtractionFormatType = 'txt-plain') {
    this.formatType = formatType;
  }

  getSupportedExtensions(): string[] {
    return ['.txt', '.csv', '.md'];
  }

  getStrategyType(): TextExtractorType {
    return 'txt-default';
  }

  getFormatType(): TextExtractionFormatType {
    return this.formatType;
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractFromTxt(filePath);
    return {
      content,
      images: [],
    };
  }
}
