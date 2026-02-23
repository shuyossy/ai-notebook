import { AppError } from '@/main/lib/error';

/**
 * テキスト抽出戦略固有のエラー
 * このエラーが発生した場合、別の戦略にフォールバックを試みることができる
 */
export class TextExtractorStrategyError extends AppError {
  public readonly strategyType: string;

  constructor(strategyType: string, options?: { cause?: unknown }) {
    super('INTERNAL', {
      expose: true,
      messageCode: 'FILE_TEXT_EXTRACTION_STRATEGY_ERROR',
      messageParams: { strategyType },
      cause: options?.cause,
    });
    this.name = 'TextExtractorStrategyError';
    this.strategyType = strategyType;
  }
}
