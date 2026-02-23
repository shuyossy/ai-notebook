import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { extractViaPowerShell } from '../extractionUtils';

/**
 * PowerShell COM経由のPowerPointテキスト抽出戦略
 */
export class PowerShellPptStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.ppt', '.pptx'];
  }

  getStrategyType(): TextExtractorType {
    return 'powershell-ppt';
  }

  getFormatType(): TextExtractionFormatType {
    return 'pptx-plain';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const content = await extractViaPowerShell(filePath, 'ppt');
    return {
      content,
      images: [],
    };
  }
}
