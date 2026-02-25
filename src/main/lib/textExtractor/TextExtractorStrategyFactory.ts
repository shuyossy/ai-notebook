import type { ITextExtractorStrategy } from '@/main/service/port/textExtractor';
import type { TextExtractorType, TextExtractionFormatType } from '@/types';
import { TxtExtractorStrategy } from './strategies/TxtExtractorStrategy';
import { PowerShellWordStrategy } from './strategies/PowerShellWordStrategy';
import { PowerShellExcelStrategy } from './strategies/PowerShellExcelStrategy';
import { PowerShellPptStrategy } from './strategies/PowerShellPptStrategy';
import { PdfjsDistStrategy } from './strategies/PdfjsDistStrategy';
import { DocxMammothRichStrategy } from './strategies/DocxMammothRichStrategy';
import { XlsxSheetJsRichStrategy } from './strategies/XlsxSheetJsRichStrategy';
import { PptxRichExtractorStrategy } from './strategies/PptxRichExtractorStrategy';
import { PdfjsRichStrategy } from './strategies/PdfjsRichStrategy';

/**
 * 拡張子ごとの戦略優先度マップ
 * 先頭が最も優先度が高い。リッチ戦略が先頭に配置され、失敗時にプレーン戦略にフォールバックする。
 */
const STRATEGY_PRIORITY_MAP: Record<string, TextExtractorType[]> = {
  '.txt': ['txt-default'],
  '.csv': ['txt-default'],
  '.md': ['txt-default'],
  '.doc': ['powershell-word'],
  '.docx': ['docx-mammoth-rich', 'powershell-word'],
  '.xls': ['powershell-excel'],
  '.xlsx': ['xlsx-sheetjs-rich', 'powershell-excel'],
  '.ppt': ['powershell-ppt'],
  '.pptx': ['pptx-rich', 'powershell-ppt'],
  '.pdf': ['pdfjs-rich', 'pdfjs-dist'],
};

/**
 * 拡張子に応じたformatTypeマッピング（txt-default戦略用）
 */
const TXT_FORMAT_TYPE_MAP: Record<string, TextExtractionFormatType> = {
  '.csv': 'csv-plain',
  '.md': 'md-plain',
};

/**
 * 戦略タイプからインスタンスを生成するレジストリ
 * txt-defaultは拡張子に応じてformatTypeを切り替える
 */
const STRATEGY_REGISTRY: Record<
  TextExtractorType,
  (extension: string) => ITextExtractorStrategy
> = {
  'txt-default': (ext) =>
    new TxtExtractorStrategy(TXT_FORMAT_TYPE_MAP[ext] ?? 'txt-plain'),
  'powershell-word': () => new PowerShellWordStrategy(),
  'powershell-excel': () => new PowerShellExcelStrategy(),
  'powershell-ppt': () => new PowerShellPptStrategy(),
  'pdfjs-dist': () => new PdfjsDistStrategy(),
  'docx-mammoth-rich': () => new DocxMammothRichStrategy(),
  'xlsx-sheetjs-rich': () => new XlsxSheetJsRichStrategy(),
  'pptx-rich': () => new PptxRichExtractorStrategy(),
  'pdfjs-rich': () => new PdfjsRichStrategy(),
};

/**
 * テキスト抽出戦略ファクトリ
 */
export class TextExtractorStrategyFactory {
  /**
   * 指定した拡張子に対する戦略を優先度順に取得
   */
  static getStrategiesInPriorityOrder(
    extension: string,
  ): ITextExtractorStrategy[] {
    const ext = extension.toLowerCase();
    const types = STRATEGY_PRIORITY_MAP[ext];
    if (!types) {
      return [];
    }
    return types
      .map((type) => {
        const factory = STRATEGY_REGISTRY[type];
        return factory ? factory(ext) : null;
      })
      .filter((s): s is ITextExtractorStrategy => s !== null);
  }

  /**
   * 指定した拡張子で利用可能な戦略タイプ一覧を取得
   */
  static getAvailableStrategies(extension: string): TextExtractorType[] {
    const ext = extension.toLowerCase();
    return STRATEGY_PRIORITY_MAP[ext] ?? [];
  }

  /**
   * 指定した拡張子がサポートされているか判定
   */
  static isSupported(extension: string): boolean {
    return extension.toLowerCase() in STRATEGY_PRIORITY_MAP;
  }
}
