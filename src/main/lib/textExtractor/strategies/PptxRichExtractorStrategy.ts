import JSZip from 'jszip';
import * as cheerio from 'cheerio';
import path from 'path';
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
import { PptxSlideParser, type PptxImage } from '../PptxSlideParser';
import {
  formatImageTag,
  formatDrawingTagFull,
  formatDrawingTagShort,
  getArrowSymbol,
} from '../XlsxDrawingParser';
import type { DrawingShapeText, DrawingConnector } from '../XlsxDrawingParser';
import { getMimeFromExt, isAiCompatibleMime } from '../mimeUtils';
import { getMainLogger } from '@/main/lib/logger';

/**
 * スライドごとの解析済み描画情報（内部用）
 */
interface SlideDrawingResult {
  images: PptxImage[];
  imagePaths: Map<string, string>;
  shapeTexts: DrawingShapeText[];
  connectors: DrawingConnector[];
  tableCsvLines: string[];
  imagesFailed: boolean;
  shapesFailed: boolean;
  tablesFailed: boolean;
}

/**
 * PowerPointファイル（.pptx）のリッチ抽出戦略
 * JSZip + PptxSlideParserによるPresentationML解析で画像・表・図形テキストにも対応
 */
export class PptxRichExtractorStrategy implements ITextExtractorStrategy {
  private slideParser = new PptxSlideParser();

  getSupportedExtensions(): string[] {
    return ['.pptx'];
  }

  getStrategyType(): TextExtractorType {
    return 'pptx-rich';
  }

  getFormatType(): TextExtractionFormatType {
    return 'pptx-rich-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    // ファイル読み込み（I/Oエラーはそのまま伝播）
    const buffer = await readFile(filePath);

    try {
      const zip = await JSZip.loadAsync(buffer);

      // presentation.xmlからスライド順序を取得
      const slideOrder = await this.getSlideOrder(zip);
      if (slideOrder.length === 0) {
        throw new TextExtractorStrategyError('pptx-rich');
      }

      let hasAnySlides = false;
      let anyImagesFailed = false;
      let anyShapesFailed = false;
      let anyTablesFailed = false;

      const slideResults: { slideNum: number; result: SlideDrawingResult }[] =
        [];

      for (const slideNum of slideOrder) {
        const slidePath = `ppt/slides/slide${slideNum}.xml`;
        const slideFile = zip.file(slidePath);
        if (!slideFile) continue;

        hasAnySlides = true;

        const slideXml = await slideFile.async('string');
        const slideDir = 'ppt/slides';

        const slideRelsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
        const slideRelsFile = zip.file(slideRelsPath);
        let relsXml = '';
        if (slideRelsFile) {
          relsXml = await slideRelsFile.async('string');
        }

        const drawingResult = await this.parseSlideDrawings(
          slideXml,
          relsXml,
          slideDir,
        );

        if (drawingResult.imagesFailed) anyImagesFailed = true;
        if (drawingResult.shapesFailed) anyShapesFailed = true;
        if (drawingResult.tablesFailed) anyTablesFailed = true;

        slideResults.push({ slideNum, result: drawingResult });
      }

      // いずれかのスライドでいずれかのカテゴリが失敗した場合はフォールバック
      if (
        hasAnySlides &&
        (anyImagesFailed || anyShapesFailed || anyTablesFailed)
      ) {
        throw new TextExtractorStrategyError('pptx-rich');
      }

      const allImages: ExtractedImage[] = [];
      let imageCounter = 0;
      let drawingCounter = 0;
      const drawingObjectIdToShapeId = new Map<number, string>();
      const parts: string[] = [];

      for (const { slideNum, result } of slideResults) {
        parts.push(`#slide:${slideNum}`);

        // テーブルCSV行を出力
        if (!result.tablesFailed && result.tableCsvLines.length > 0) {
          parts.push('');
          for (const line of result.tableCsvLines) {
            parts.push(line);
          }
        }

        // 画像を処理
        if (!result.imagesFailed) {
          for (const img of result.images) {
            const imgPath = result.imagePaths.get(img.rId);
            if (!imgPath) continue;

            const imgFile = zip.file(imgPath);
            if (!imgFile) continue;

            const ext = path.extname(imgPath).slice(1).toLowerCase() || 'png';
            const mimeType = getMimeFromExt(ext);

            // AI非互換画像はスキップ（EMF, WMF等）
            if (!isAiCompatibleMime(mimeType)) {
              continue;
            }

            imageCounter++;
            const imgBuffer = await imgFile.async('nodebuffer');
            const referenceId = `image_${imageCounter}.${ext}`;

            allImages.push({
              referenceId,
              base64Data: `data:${mimeType};base64,${imgBuffer.toString('base64')}`,
              mimeType,
            });

            parts.push(formatImageTag(referenceId));
          }
        }

        // 図形テキストを処理
        if (!result.shapesFailed) {
          for (const shape of result.shapeTexts) {
            if (shape.isTextBox) {
              // テキストボックス/プレースホルダ: プレフィックスなし
              parts.push(shape.text);
            } else {
              drawingCounter++;
              const shapeId = `s${drawingCounter}`;

              if (shape.drawingObjectId !== undefined) {
                drawingObjectIdToShapeId.set(shape.drawingObjectId, shapeId);
              }

              const lines = shape.text.split('\n');
              const fullTag = formatDrawingTagFull(shapeId, shape.metadata);

              let shapeText: string;
              if (lines.length === 1) {
                shapeText = `${fullTag} ${lines[0]}`;
              } else {
                const shortTag = formatDrawingTagShort(shapeId);
                shapeText = lines
                  .map((line, i) =>
                    i === 0 ? `${fullTag} ${line}` : `${shortTag} ${line}`,
                  )
                  .join('\n');
              }

              parts.push(shapeText);
            }
          }

          // コネクタを処理
          for (const connector of result.connectors) {
            drawingCounter++;
            const connectorId = `c${drawingCounter}`;

            const arrowSymbol = getArrowSymbol(
              connector.headEndType,
              connector.tailEndType,
            );

            let startLabel: string | undefined;
            let endLabel: string | undefined;

            if (connector.startConnection) {
              const resolvedId = drawingObjectIdToShapeId.get(
                connector.startConnection.drawingObjectId,
              );
              startLabel = resolvedId ?? undefined;
            }

            if (connector.endConnection) {
              const resolvedId = drawingObjectIdToShapeId.get(
                connector.endConnection.drawingObjectId,
              );
              endLabel = resolvedId ?? undefined;
            }

            let connectionPart: string | undefined;
            if (startLabel && endLabel) {
              connectionPart = `${startLabel}${arrowSymbol}${endLabel}`;
            }

            const connectorTag = formatDrawingTagFull(
              connectorId,
              connector.metadata,
              connectionPart,
            );

            parts.push(connectorTag);
          }
        }
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
      throw new TextExtractorStrategyError('pptx-rich', {
        cause: error,
      });
    }
  }

  /**
   * presentation.xmlとそのリレーションシップからスライドの番号順序を取得する
   */
  private async getSlideOrder(zip: JSZip): Promise<number[]> {
    const presentationFile = zip.file('ppt/presentation.xml');
    const presentationRelsFile = zip.file('ppt/_rels/presentation.xml.rels');

    if (!presentationFile || !presentationRelsFile) {
      return [];
    }

    const presentationXml = await presentationFile.async('string');
    const presentationRelsXml = await presentationRelsFile.async('string');

    const $ = cheerio.load(presentationXml, { xml: true });
    const slideRIds: string[] = [];
    $('p\\:sldIdLst > p\\:sldId, sldIdLst > sldId').each((_, el) => {
      const rId = $(el).attr('r:id');
      if (rId) {
        slideRIds.push(rId);
      }
    });

    const rels = this.slideParser.parseRelationships(presentationRelsXml);
    const rIdToTarget = new Map(rels.map((r) => [r.rId, r.target]));

    const slideNumbers: number[] = [];
    for (const rId of slideRIds) {
      const target = rIdToTarget.get(rId);
      if (target) {
        const match = target.match(/slide(\d+)\.xml$/);
        if (match) {
          slideNumbers.push(parseInt(match[1], 10));
        }
      }
    }

    return slideNumbers;
  }

  /**
   * スライドXMLの描画要素（画像・図形・テーブル）を解析する
   */
  private async parseSlideDrawings(
    slideXml: string,
    relsXml: string,
    slideDir: string,
  ): Promise<SlideDrawingResult> {
    const logger = getMainLogger();

    let images: PptxImage[] = [];
    let imagePaths = new Map<string, string>();
    let imagesFailed = false;

    try {
      images = this.slideParser.parseImages(slideXml);

      if (relsXml) {
        const relationships = this.slideParser.parseRelationships(relsXml);
        imagePaths = this.slideParser.resolveImagePaths(
          images,
          relationships,
          slideDir,
        );
      }
    } catch (error) {
      imagesFailed = true;
      logger.warn(`スライドの画像解析に失敗しました: ${error}`);
    }

    let shapeTexts: DrawingShapeText[] = [];
    let connectors: DrawingConnector[] = [];
    let shapesFailed = false;

    try {
      shapeTexts = this.slideParser.parseShapeTexts(slideXml);
      connectors = this.slideParser.parseConnectors(slideXml);
    } catch (error) {
      shapesFailed = true;
      logger.warn(`スライドの図形/コネクタ解析に失敗しました: ${error}`);
    }

    let tableCsvLines: string[] = [];
    let tablesFailed = false;

    try {
      const tables = this.slideParser.parseTables(slideXml);
      for (const table of tables) {
        for (const row of table.rows) {
          const csvLine = row
            .map((cell) => this.slideParser.escapeCsvCell(cell))
            .join(',');
          tableCsvLines.push(csvLine);
        }
        tableCsvLines.push('');
      }
      // 末尾の空行を除去
      while (
        tableCsvLines.length > 0 &&
        tableCsvLines[tableCsvLines.length - 1] === ''
      ) {
        tableCsvLines.pop();
      }
    } catch (error) {
      tablesFailed = true;
      tableCsvLines = [];
      logger.warn(`スライドのテーブル解析に失敗しました: ${error}`);
    }

    return {
      images,
      imagePaths,
      shapeTexts,
      connectors,
      tableCsvLines,
      imagesFailed,
      shapesFailed,
      tablesFailed,
    };
  }
}
