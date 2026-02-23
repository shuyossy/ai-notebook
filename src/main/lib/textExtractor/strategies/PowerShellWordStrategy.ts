import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractViaPowerShell } from '../extractionUtils';

/**
 * PowerShell COM経由のWord文書テキスト抽出戦略
 */
export class PowerShellWordStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.doc', '.docx'];
  }

  getStrategyType(): TextExtractorType {
    return 'powershell-word';
  }

  getFormatType(): TextExtractionFormatType {
    return 'docx-plain';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractViaPowerShell(filePath, 'word');
    return {
      content,
      images: [],
    };
  }
}
