import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractFromTxt } from '../extractionUtils';

/**
 * プレーンテキストファイル用の抽出戦略
 */
export class TxtExtractorStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.txt'];
  }

  getStrategyType(): TextExtractorType {
    return 'txt-default';
  }

  getFormatType(): TextExtractionFormatType {
    return 'txt-plain';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractFromTxt(filePath);
    return {
      content,
      images: [],
    };
  }
}
