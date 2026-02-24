import { readFileSync } from 'fs';
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
import { formatImageTag } from '../XlsxDrawingParser';
import { getMainLogger } from '@/main/lib/logger';

// Y座標が近いアイテムを同一行とみなす閾値
const Y_GROUP_THRESHOLD = 2;

/**
 * PDF仕様の6要素アフィン変換行列 [a, b, c, d, e, f] を乗算する
 */
function multiplyMatrix(
  m1: [number, number, number, number, number, number],
  m2: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** 位置付きテキスト行 */
interface PositionedTextLine {
  yTopDown: number;
  text: string;
}

/** 位置付き画像 */
interface PositionedImage {
  yTopDown: number;
  imageKey: string;
  rawData: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    channels: number;
  };
}

/**
 * getTextContent()の結果から位置付きテキスト行を抽出する
 */
function extractPositionedTextLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  viewportHeight: number,
): PositionedTextLine[] {
  const textItems = items.filter(
    (item) => typeof item.str === 'string' && item.transform,
  );

  if (textItems.length === 0) {
    return [];
  }

  const positioned = textItems.map((item) => ({
    str: item.str as string,
    x: item.transform[4] as number,
    yTopDown: viewportHeight - (item.transform[5] as number),
  }));

  // Y座標でソート（上→下）、同一Y座標ならX座標で（左→右）
  positioned.sort((a, b) => a.yTopDown - b.yTopDown || a.x - b.x);

  const lines: PositionedTextLine[] = [];
  let currentLineY = positioned[0].yTopDown;
  let currentLineTexts: string[] = [];

  for (const item of positioned) {
    if (Math.abs(item.yTopDown - currentLineY) > Y_GROUP_THRESHOLD) {
      const text = currentLineTexts.join('').trim();
      if (text) {
        lines.push({ yTopDown: currentLineY, text });
      }
      currentLineY = item.yTopDown;
      currentLineTexts = [item.str];
    } else {
      currentLineTexts.push(item.str);
    }
  }

  const lastText = currentLineTexts.join('').trim();
  if (lastText) {
    lines.push({ yTopDown: currentLineY, text: lastText });
  }

  return lines;
}

/**
 * OperatorListからCTMをトラッキングし、paintImageXObject時のY座標と画像データを取得する
 */
async function extractPositionedImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operatorList: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OPS: any,
  viewportHeight: number,
): Promise<PositionedImage[]> {
  const images: PositionedImage[] = [];
  const ctmStack: [number, number, number, number, number, number][] = [];
  let currentCTM: [number, number, number, number, number, number] = [
    1, 0, 0, 1, 0, 0,
  ];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const op = operatorList.fnArray[i];
    const args = operatorList.argsArray[i];

    if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
      ctmStack.push([...currentCTM] as typeof currentCTM);
    } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) {
      if (ctmStack.length > 0) {
        currentCTM = ctmStack.pop()!;
      }
    } else if (op === OPS.transform) {
      const transformMatrix: [number, number, number, number, number, number] =
        [args[0], args[1], args[2], args[3], args[4], args[5]];
      currentCTM = multiplyMatrix(currentCTM, transformMatrix);
    } else if (op === OPS.paintImageXObject) {
      const imageKey = args[0] as string;

      const yPdf = currentCTM[5];
      const imageHeightInPdf = Math.abs(currentCTM[3]);
      const yTopDown = viewportHeight - yPdf - imageHeightInPdf;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const image: any = await new Promise((resolve) =>
        (imageKey.startsWith('g_') ? page.commonObjs : page.objs).get(
          imageKey,
          resolve,
        ),
      );

      if (!image || !image.data || !image.width || !image.height) {
        continue;
      }

      const { width, height, data } = image;
      const calculatedChannels = data.length / (width * height);
      if (![1, 2, 3, 4].includes(calculatedChannels)) {
        continue;
      }

      images.push({
        yTopDown,
        imageKey,
        rawData: {
          data,
          width,
          height,
          channels: calculatedChannels,
        },
      });
    }
  }

  return images;
}

/** インターリーブ用の統合要素 */
type InterleavedElement =
  | { type: 'text'; yTopDown: number; text: string }
  | { type: 'image'; yTopDown: number; image: PositionedImage };

/**
 * テキスト行と画像をY座標（上→下）でソートしてインターリーブする
 */
function interleaveByPosition(
  textLines: PositionedTextLine[],
  images: PositionedImage[],
): InterleavedElement[] {
  const elements: InterleavedElement[] = [];

  for (const line of textLines) {
    elements.push({ type: 'text', yTopDown: line.yTopDown, text: line.text });
  }
  for (const img of images) {
    elements.push({ type: 'image', yTopDown: img.yTopDown, image: img });
  }

  elements.sort((a, b) => {
    if (a.yTopDown !== b.yTopDown) {
      return a.yTopDown - b.yTopDown;
    }
    if (a.type === b.type) return 0;
    return a.type === 'text' ? -1 : 1;
  });

  return elements;
}

/**
 * PDF文書（.pdf）のリッチ抽出戦略
 * pdfjs-dist低レベルAPIで位置情報を取得し、画像をテキスト内の正しい位置に配置する
 */
export class PdfjsRichStrategy implements ITextExtractorStrategy {
  getSupportedExtensions(): string[] {
    return ['.pdf'];
  }

  getStrategyType(): TextExtractorType {
    return 'pdfjs-rich';
  }

  getFormatType(): TextExtractionFormatType {
    return 'pdf-rich-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    const logger = getMainLogger();

    // ファイル読み込み（I/Oエラーはそのまま伝播）
    const fileData = readFileSync(filePath);

    try {
      // 既存パターンに合わせてpdfjs-dist/legacy/build/pdf.mjsを使用
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { getDocument, OPS } = pdfjs;

      const data = new Uint8Array(fileData);
      const loadingTask = getDocument({ data });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        throw new TextExtractorStrategyError('pdfjs-rich');
      }

      const parts: string[] = [];
      const allImages: ExtractedImage[] = [];
      let imageCounter = 0;
      let anyImagesFailed = false;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        parts.push(`#page:${pageNum}`);

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const viewportHeight = viewport.height;

        // テキスト抽出（位置情報付き）
        const textContent = await page.getTextContent();
        const textLines = extractPositionedTextLines(
          textContent.items,
          viewportHeight,
        );

        // 画像抽出（位置情報付き）
        let positionedImages: PositionedImage[] = [];
        try {
          const operatorList = await page.getOperatorList();
          positionedImages = await extractPositionedImages(
            page,
            operatorList,
            OPS,
            viewportHeight,
          );
        } catch (error) {
          anyImagesFailed = true;
          logger.warn(`ページ${pageNum}の画像解析に失敗しました: ${error}`);
        }

        // テキストと画像をY座標でインターリーブ
        const elements = interleaveByPosition(textLines, positionedImages);

        for (const element of elements) {
          if (element.type === 'text') {
            parts.push(element.text);
          } else {
            try {
              imageCounter++;
              const rawData = element.image.rawData;

              // sharpでPNG変換
              const sharp = (await import('sharp')).default;
              const pngBuffer = await sharp(
                Buffer.from(
                  rawData.data.buffer,
                  rawData.data.byteOffset,
                  rawData.data.byteLength,
                ),
                {
                  raw: {
                    width: rawData.width,
                    height: rawData.height,
                    channels: rawData.channels as 1 | 2 | 3 | 4,
                  },
                },
              )
                .png()
                .toBuffer();

              const referenceId = `image_${imageCounter}.png`;
              allImages.push({
                referenceId,
                base64Data: `data:image/png;base64,${pngBuffer.toString('base64')}`,
                mimeType: 'image/png',
              });
              parts.push(formatImageTag(referenceId));
            } catch (sharpError) {
              // sharp変換失敗: 該当画像をスキップ（フォールバックしない）
              logger.warn(
                `ページ${pageNum}の画像${imageCounter}のPNG変換に失敗しました: ${sharpError}`,
              );
            }
          }
        }
      }

      // 1ページでも画像解析に失敗した場合はフォールバック
      if (anyImagesFailed) {
        throw new TextExtractorStrategyError('pdfjs-rich');
      }

      const content = parts.join('\n');

      return {
        content,
        images: allImages,
      };
    } catch (error) {
      if (error instanceof TextExtractorStrategyError) {
        throw error;
      }
      throw new TextExtractorStrategyError('pdfjs-rich', { cause: error });
    }
  }
}
