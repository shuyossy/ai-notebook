import mammoth from 'mammoth';
import { readFile } from 'fs/promises';
import type {
  ITextExtractorStrategy,
  TextExtractionResult,
} from '@/main/service/port/textExtractor';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';
import type {
  TextExtractorType,
  TextExtractionFormatType,
  ExtractedImage,
} from '@/types';
import { DocxHtmlToTextConverter } from '../DocxHtmlToTextConverter';
import { getExtFromMime } from '../mimeUtils';

/**
 * Word文書（.docx）のリッチ抽出戦略
 * mammothのHTML変換を使用し、画像・表構造を保持してテキスト抽出する
 */
export class DocxMammothRichStrategy implements ITextExtractorStrategy {
  private converter = new DocxHtmlToTextConverter();

  getSupportedExtensions(): string[] {
    return ['.docx'];
  }

  getStrategyType(): TextExtractorType {
    return 'docx-mammoth-rich';
  }

  getFormatType(): TextExtractionFormatType {
    return 'docx-rich-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    // ファイル読み込み（I/Oエラーはそのまま伝播）
    const buffer = await readFile(filePath);

    try {
      const images: ExtractedImage[] = [];
      let imageCounter = 0;

      // カスタム画像ハンドラ: 画像をExtractedImageとして収集
      const convertImage = mammoth.images.imgElement(async (image) => {
        imageCounter++;
        const base64 = await image.readAsBase64String();
        const mimeType = image.contentType || 'image/png';
        const ext = getExtFromMime(mimeType);
        const referenceId = `image_${imageCounter}.${ext}`;

        images.push({
          referenceId,
          base64Data: `data:${mimeType};base64,${base64}`,
          mimeType,
        });

        return { src: referenceId };
      });

      // mammothでHTML変換
      const result = await mammoth.convertToHtml({ buffer }, { convertImage });

      // HTML→テキスト変換
      const content = this.converter.convert(result.value);

      return {
        content,
        images,
      };
    } catch (error) {
      if (error instanceof TextExtractorStrategyError) {
        throw error;
      }
      // その他のエラーはTextExtractorStrategyErrorでラップ（フォールバック可能に）
      throw new TextExtractorStrategyError('docx-mammoth-rich', {
        cause: error,
      });
    }
  }
}
