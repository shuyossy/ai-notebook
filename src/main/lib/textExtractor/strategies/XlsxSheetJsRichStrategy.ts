import JSZip from 'jszip';
import * as XLSX from 'xlsx';
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
import {
  XlsxDrawingParser,
  DRAWING_RELATIONSHIP_TYPE,
  formatImageTag,
  formatDrawingTagFull,
  formatDrawingTagShort,
  getArrowSymbol,
  resolveConnectorEndpoints,
} from '../XlsxDrawingParser';
import type {
  DrawingImage,
  DrawingShapeText,
  DrawingConnector,
} from '../XlsxDrawingParser';
import { splitCsvIntoLogicalRows } from '../csvUtils';
import { getMimeFromExt, isAiCompatibleMime } from '../mimeUtils';
import { getMainLogger } from '@/main/lib/logger';

/**
 * シートごとの描画情報
 */
interface SheetDrawingInfo {
  images: DrawingImage[];
  shapeTexts: DrawingShapeText[];
  connectors: DrawingConnector[];
  imagePaths: Map<string, string>;
  imagesFailed: boolean;
  shapesFailed: boolean;
}

/**
 * Excelファイル（.xlsx）のリッチ抽出戦略
 * SheetJSによるCSV変換 + jszipによるDrawingML解析で画像・図形テキストにも対応
 */
export class XlsxSheetJsRichStrategy implements ITextExtractorStrategy {
  private drawingParser = new XlsxDrawingParser();

  getSupportedExtensions(): string[] {
    return ['.xlsx'];
  }

  getStrategyType(): TextExtractorType {
    return 'xlsx-sheetjs-rich';
  }

  getFormatType(): TextExtractionFormatType {
    return 'xlsx-rich-v1';
  }

  async extract(filePath: string): Promise<TextExtractionResult> {
    // ファイル読み込み（I/Oエラーはそのまま伝播）
    const buffer = await readFile(filePath);

    try {
      const zip = await JSZip.loadAsync(buffer);

      // SheetJSで各シートのCSVテキストを抽出
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // シート→drawing のマッピングを構築
      const sheetDrawingMap = await this.buildSheetDrawingMap(
        zip,
        workbook.SheetNames,
      );

      // ワークブック全体で画像/図形の失敗状態を集計
      let hasAnyDrawings = false;
      let anyImagesFailed = false;
      let anyShapesFailed = false;

      for (const [, info] of sheetDrawingMap) {
        hasAnyDrawings = true;
        if (info.imagesFailed) anyImagesFailed = true;
        if (info.shapesFailed) anyShapesFailed = true;
      }

      // いずれかのシートでいずれかのカテゴリが失敗した場合はフォールバック
      if (hasAnyDrawings && (anyImagesFailed || anyShapesFailed)) {
        throw new TextExtractorStrategyError('xlsx-sheetjs-rich');
      }

      const allImages: ExtractedImage[] = [];
      let imageCounter = 0;
      let drawingCounter = 0;
      const drawingObjectIdToShapeId = new Map<number, string>();
      const parts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        parts.push(`#sheet:${sheetName}`);

        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: true });
        const drawingInfo = sheetDrawingMap.get(sheetName);

        const rangeStartRow = sheet['!ref']
          ? XLSX.utils.decode_range(sheet['!ref']).s.r
          : 0;

        // 描画情報がなければCSVに[row:N]マーカーを付与して出力
        if (!drawingInfo) {
          this.formatCsvWithRowMarkers(csv, rangeStartRow, parts);
          continue;
        }

        // 描画要素をrowIndex → テキスト配列のマップに集約
        const drawingsByRow = new Map<number, string[]>();

        // 画像を処理
        if (!drawingInfo.imagesFailed) {
          for (const img of drawingInfo.images) {
            const imgPath = drawingInfo.imagePaths.get(img.rId);
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

            const entries = drawingsByRow.get(img.rowIndex) ?? [];
            entries.push(formatImageTag(referenceId, img.cellRange));
            drawingsByRow.set(img.rowIndex, entries);
          }
        }

        // 図形テキストを処理
        if (!drawingInfo.shapesFailed) {
          for (const shape of drawingInfo.shapeTexts) {
            drawingCounter++;
            const shapeId = `shape_${drawingCounter}`;

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

            const entries = drawingsByRow.get(shape.rowIndex) ?? [];
            entries.push(shapeText);
            drawingsByRow.set(shape.rowIndex, entries);
          }

          // コネクタを処理
          for (const connector of drawingInfo.connectors) {
            drawingCounter++;
            const connectorId = `connector_${drawingCounter}`;

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

            // 両方とも接続先が解決できない場合、セル範囲から算出
            if (!startLabel && !endLabel && connector.metadata?.cellRange) {
              const [startCell, endCell] = resolveConnectorEndpoints(
                connector.metadata.cellRange,
                connector.flipH,
                connector.flipV,
              );
              startLabel = startCell;
              endLabel = endCell;
            } else {
              // 片方のみ接続 → 未解決側をセル範囲から算出
              if (connector.metadata?.cellRange) {
                const [startCell, endCell] = resolveConnectorEndpoints(
                  connector.metadata.cellRange,
                  connector.flipH,
                  connector.flipV,
                );
                if (!startLabel) startLabel = startCell;
                if (!endLabel) endLabel = endCell;
              }
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

            const entries = drawingsByRow.get(connector.rowIndex) ?? [];
            entries.push(connectorTag);
            drawingsByRow.set(connector.rowIndex, entries);
          }
        }

        // 描画要素がなければCSVに[row:N]マーカーを付与して出力
        if (drawingsByRow.size === 0) {
          this.formatCsvWithRowMarkers(csv, rangeStartRow, parts);
          continue;
        }

        // CSVを行単位に分割してインターリーブ
        const csvLines = splitCsvIntoLogicalRows(csv);
        const consumedRows = new Set<number>();

        for (let i = 0; i < csvLines.length; i++) {
          const csvLine = csvLines[i];
          const sheetRow = rangeStartRow + i;
          const excelRow = sheetRow + 1;

          const isNonEmpty = csvLine.replace(/,/g, '').trim().length > 0;
          if (isNonEmpty) {
            parts.push(`[row:${excelRow}] ${csvLine}`);
          } else {
            parts.push(csvLine);
          }

          const drawings = drawingsByRow.get(sheetRow);
          if (drawings) {
            for (const text of drawings) {
              parts.push(text);
            }
            consumedRows.add(sheetRow);
          }
        }

        // CSV範囲外の描画要素を末尾に追記
        const unconsumedRows = [...drawingsByRow.keys()]
          .filter((row) => !consumedRows.has(row))
          .sort((a, b) => a - b);

        if (unconsumedRows.length > 0) {
          for (const row of unconsumedRows) {
            const drawings = drawingsByRow.get(row)!;
            for (const text of drawings) {
              parts.push(text);
            }
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
      throw new TextExtractorStrategyError('xlsx-sheetjs-rich', {
        cause: error,
      });
    }
  }

  /**
   * CSVテキストに[row:N]マーカーを付与してpartsに追加する
   */
  private formatCsvWithRowMarkers(
    csv: string,
    rangeStartRow: number,
    parts: string[],
  ): void {
    const csvLines = splitCsvIntoLogicalRows(csv);
    for (let i = 0; i < csvLines.length; i++) {
      const csvLine = csvLines[i];
      const isNonEmpty = csvLine.replace(/,/g, '').trim().length > 0;
      if (isNonEmpty) {
        const excelRow = rangeStartRow + i + 1;
        parts.push(`[row:${excelRow}] ${csvLine}`);
      } else {
        parts.push(csvLine);
      }
    }
  }

  /**
   * ZIPからシート名→描画情報のマッピングを構築する
   */
  private async buildSheetDrawingMap(
    zip: JSZip,
    sheetNames: string[],
  ): Promise<Map<string, SheetDrawingInfo>> {
    const result = new Map<string, SheetDrawingInfo>();
    const logger = getMainLogger();

    const sheetRelsFolder = zip.folder('xl/worksheets/_rels');
    if (!sheetRelsFolder) return result;

    // workbook.xmlからシートファイルベース名→シート名のマッピングを構築
    const sheetFileMapping = await this.buildSheetFileMappingFromWorkbook(zip);

    const sheetRelsFiles: { sheetNum: number; path: string }[] = [];
    sheetRelsFolder.forEach((relativePath, file) => {
      const match = relativePath.match(/^sheet(\d+)\.xml\.rels$/);
      if (match && !file.dir) {
        sheetRelsFiles.push({
          sheetNum: parseInt(match[1], 10),
          path: `xl/worksheets/_rels/${relativePath}`,
        });
      }
    });

    for (const { sheetNum, path: relsPath } of sheetRelsFiles) {
      const relsFile = zip.file(relsPath);
      if (!relsFile) continue;

      const relsXml = await relsFile.async('string');
      const rels = this.drawingParser.parseRelationships(relsXml);

      const sheetFileBase = `sheet${sheetNum}`;
      const resolvedSheetName =
        sheetFileMapping?.get(sheetFileBase) ?? sheetNames[sheetNum - 1];

      if (!resolvedSheetName) continue;

      for (const rel of rels) {
        const isDrawing = rel.type
          ? rel.type === DRAWING_RELATIONSHIP_TYPE
          : rel.target.includes('drawing');
        if (!isDrawing) continue;

        const drawingPath = this.drawingParser.resolveRelativePath(
          'xl/worksheets',
          rel.target,
        );
        const drawingFile = zip.file(drawingPath);
        if (!drawingFile) continue;

        const drawingXml = await drawingFile.async('string');

        // 画像解析と図形/コネクタ解析を独立したtry-catchで分離
        let images: DrawingImage[] = [];
        let imagePaths = new Map<string, string>();
        let imagesFailed = false;

        try {
          images = this.drawingParser.parseImages(drawingXml);

          const drawingDir = path.dirname(drawingPath);
          const drawingRelsPath = `${drawingDir}/_rels/${path.basename(drawingPath)}.rels`;

          const drawingRelsFile = zip.file(drawingRelsPath);
          if (drawingRelsFile) {
            const drawingRelsXml = await drawingRelsFile.async('string');
            const drawingRels =
              this.drawingParser.parseRelationships(drawingRelsXml);
            imagePaths = this.drawingParser.resolveImagePaths(
              images,
              drawingRels,
              drawingDir,
            );
          }
        } catch (error) {
          imagesFailed = true;
          logger.warn(`画像解析に失敗しました: ${drawingPath}: ${error}`);
        }

        let shapeTexts: DrawingShapeText[] = [];
        let connectors: DrawingConnector[] = [];
        let shapesFailed = false;

        try {
          shapeTexts = this.drawingParser.parseShapeTexts(drawingXml);
          connectors = this.drawingParser.parseConnectors(drawingXml);
        } catch (error) {
          shapesFailed = true;
          logger.warn(
            `図形/コネクタ解析に失敗しました: ${drawingPath}: ${error}`,
          );
        }

        result.set(resolvedSheetName, {
          images,
          shapeTexts,
          connectors,
          imagePaths,
          imagesFailed,
          shapesFailed,
        });
      }
    }

    return result;
  }

  /**
   * workbook.xml + workbook.xml.rels からシートファイルベース名→シート名のマッピングを構築する
   */
  private async buildSheetFileMappingFromWorkbook(
    zip: JSZip,
  ): Promise<Map<string, string> | null> {
    const workbookXmlFile = zip.file('xl/workbook.xml');
    const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');

    if (!workbookXmlFile || !workbookRelsFile) return null;

    try {
      const workbookXml = await workbookXmlFile.async('string');
      const workbookRelsXml = await workbookRelsFile.async('string');

      const $ = cheerio.load(workbookXml, { xml: true });
      const sheetEntries: { name: string; rId: string }[] = [];
      $('sheet').each((_, el) => {
        const name = $(el).attr('name');
        const rId = $(el).attr('r:id');
        if (name && rId) {
          sheetEntries.push({ name, rId });
        }
      });

      const rels = this.drawingParser.parseRelationships(workbookRelsXml);
      const rIdToTarget = new Map(rels.map((r) => [r.rId, r.target]));

      const mapping = new Map<string, string>();
      for (const entry of sheetEntries) {
        const target = rIdToTarget.get(entry.rId);
        if (target) {
          const fileName = target.split('/').pop() ?? '';
          const baseName = fileName.replace(/\.xml$/, '');
          if (baseName) {
            mapping.set(baseName, entry.name);
          }
        }
      }

      return mapping;
    } catch {
      return null;
    }
  }
}
