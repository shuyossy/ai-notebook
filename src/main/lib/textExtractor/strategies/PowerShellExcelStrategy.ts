import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractViaPowerShell } from '../extractionUtils';

/**
 * PowerShell COM経由のExcelテキスト抽出戦略
 */
export class PowerShellExcelStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.xls', '.xlsx'];
  }

  getStrategyType(): TextExtractorType {
    return 'powershell-excel';
  }

  getFormatType(): TextExtractionFormatType {
    return 'xlsx-csv-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractViaPowerShell(filePath, 'excel');
    return {
      content,
      images: [],
    };
  }
}
