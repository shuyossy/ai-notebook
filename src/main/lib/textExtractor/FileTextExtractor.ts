import path from 'path';
import type { IFileTextExtractor } from '@/main/service/port/textExtractor/IFileTextExtractor';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';
import type { FileTextExtractionResult, TextExtractorType } from '@/types';
import { internalError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';
import { TextExtractorStrategyFactory } from './TextExtractorStrategyFactory';
import { normalizeExtractedText } from './extractionUtils';

const logger = getMainLogger();

/**
 * ファイルテキスト抽出オーケストレータ
 * 拡張子に応じた戦略の選択、フォールバック、テキスト正規化を行う
 */
export class FileTextExtractor implements IFileTextExtractor {
  /**
   * ファイルからテキストを抽出
   * 優先度順に戦略を試行し、戦略固有エラーの場合のみフォールバック
   */
  async extract(
    filePath: string,
    fileName: string,
  ): Promise<FileTextExtractionResult> {
    const extension = path.extname(fileName).toLowerCase();
    const strategies =
      TextExtractorStrategyFactory.getStrategiesInPriorityOrder(extension);

    if (strategies.length === 0) {
      throw internalError({
        expose: true,
        messageCode: 'FILE_TEXT_EXTRACTION_ERROR',
        messageParams: { path: fileName },
      });
    }

    let lastError: unknown = null;

    for (const strategy of strategies) {
      try {
        logger.debug(
          `テキスト抽出戦略を実行: ${strategy.getStrategyType()} (${fileName})`,
        );

        const result = await strategy.extract(filePath);

        // 正規化処理を適用
        const normalizedContent = normalizeExtractedText(result.content);

        return {
          content: normalizedContent,
          images: result.images,
          strategyUsed: strategy.getStrategyType(),
          formatType: strategy.getFormatType(),
        };
      } catch (error) {
        lastError = error;

        // 戦略固有エラーの場合のみフォールバック
        if (error instanceof TextExtractorStrategyError) {
          logger.warn(
            `テキスト抽出戦略 ${strategy.getStrategyType()} が失敗しました。次の戦略にフォールバックします: ${fileName}`,
          );
          continue;
        }

        // ファイルI/Oエラー等は別の戦略でも同様に失敗するため即座にthrow
        throw error;
      }
    }

    // 全ての戦略が失敗した場合
    throw internalError({
      expose: true,
      messageCode: 'FILE_TEXT_EXTRACTION_ERROR',
      messageParams: { path: fileName },
      cause: lastError,
    });
  }

  getAvailableStrategies(extension: string): TextExtractorType[] {
    return TextExtractorStrategyFactory.getAvailableStrategies(extension);
  }

  isSupported(extension: string): boolean {
    return TextExtractorStrategyFactory.isSupported(extension);
  }
}
