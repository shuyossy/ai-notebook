import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractFromPdf } from '../extractionUtils';

/**
 * pdfjs-distを使用したPDFテキスト抽出戦略
 */
export class PdfjsDistStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.pdf'];
  }

  getStrategyType(): TextExtractorType {
    return 'pdfjs-dist';
  }

  getFormatType(): TextExtractionFormatType {
    return 'pdf-text-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractFromPdf(filePath);
    return {
      content,
      images: [],
    };
  }
}
