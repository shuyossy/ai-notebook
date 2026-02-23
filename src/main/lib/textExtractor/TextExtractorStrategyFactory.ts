import type { ITextExtractorStrategy } from '@/main/service/port/textExtractor';
import type { TextExtractorType } from '@/types';
import { TxtExtractorStrategy } from './strategies/TxtExtractorStrategy';
import { PowerShellWordStrategy } from './strategies/PowerShellWordStrategy';
import { PowerShellExcelStrategy } from './strategies/PowerShellExcelStrategy';
import { PowerShellPptStrategy } from './strategies/PowerShellPptStrategy';
import { PdfjsDistStrategy } from './strategies/PdfjsDistStrategy';

/**
 * 拡張子ごとの戦略優先度マップ
 * 先頭が最も優先度が高い。PBI#2-5でリッチ戦略が先頭に追加される。
 */
const STRATEGY_PRIORITY_MAP: Record<string, TextExtractorType[]> = {
  '.txt': ['txt-default'],
  '.doc': ['powershell-word'],
  '.docx': ['powershell-word'],
  '.xls': ['powershell-excel'],
  '.xlsx': ['powershell-excel'],
  '.ppt': ['powershell-ppt'],
  '.pptx': ['powershell-ppt'],
  '.pdf': ['pdfjs-dist'],
};

/**
 * 戦略タイプからインスタンスを生成するレジストリ
 */
const STRATEGY_REGISTRY: Record<
  TextExtractorType,
  () => ITextExtractorStrategy
> = {
  'txt-default': () => new TxtExtractorStrategy(),
  'powershell-word': () => new PowerShellWordStrategy(),
  'powershell-excel': () => new PowerShellExcelStrategy(),
  'powershell-ppt': () => new PowerShellPptStrategy(),
  'pdfjs-dist': () => new PdfjsDistStrategy(),
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
        return factory ? factory() : null;
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
