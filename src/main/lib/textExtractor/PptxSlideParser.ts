import * as cheerio from 'cheerio';
import {
  emuToCm,
  parseRelationships,
  resolveImagePaths,
  type DrawingShapeText,
  type DrawingConnector,
  type ShapeMetadata,
  type PositionInfo,
  type ConnectionInfo,
  type RelationshipEntry,
} from './XlsxDrawingParser';
import { escapeCsvCell as escapeCsvCellUtil } from './csvUtils';

/**
 * PPTXスライド内の画像情報
 */
export interface PptxImage {
  /** リレーションシップID */
  rId: string;
}

/**
 * PPTXスライド内のテーブル情報
 */
export interface PptxTable {
  /** 行×列のテキスト配列 */
  rows: string[][];
}

/**
 * PPTXスライドXMLを解析するパーサークラス
 * PresentationML（p:名前空間）のXML構造に対応
 */
export class PptxSlideParser {
  /**
   * スライドXMLから画像情報を抽出する
   */
  parseImages(slideXml: string): PptxImage[] {
    const $ = cheerio.load(slideXml, { xml: true });
    const images: PptxImage[] = [];

    // mc:Fallback要素を除去して重複抽出を防止（Office 2010+のAlternateContent対応）
    $('mc\\:Fallback, Fallback').remove();

    const pics = $('p\\:pic, pic');
    pics.each((_, pic) => {
      const blipFill = $(pic).find('p\\:blipFill, blipFill');
      const blip = blipFill.find('a\\:blip, blip');
      const rId = blip.attr('r:embed') || blip.attr('r:link');
      if (rId) {
        images.push({ rId });
      }
    });

    return images;
  }

  /**
   * スライドXMLから図形内テキストを抽出する
   */
  parseShapeTexts(slideXml: string): DrawingShapeText[] {
    const $ = cheerio.load(slideXml, { xml: true });
    const shapeTexts: DrawingShapeText[] = [];

    // mc:Fallback要素を除去して重複抽出を防止
    $('mc\\:Fallback, Fallback').remove();

    const shapes = $('p\\:sp, sp');
    shapes.each((_, shape) => {
      const $shape = $(shape);
      const txBody = $shape.find('p\\:txBody, txBody').first();
      if (txBody.length === 0) return;

      const fullText = this.extractShapeText($, txBody);
      if (!fullText) return;

      const metadata = this.extractShapeMetadata($shape);

      const cNvPr = $shape
        .find('p\\:nvSpPr > p\\:cNvPr, nvSpPr > cNvPr')
        .first();
      const idAttr = cNvPr.attr('id');
      const drawingObjectId = idAttr ? parseInt(idAttr, 10) : undefined;

      // テキストコンテナ判定（テキストボックス or プレースホルダー）
      const cNvSpPr = $shape
        .find('p\\:nvSpPr > p\\:cNvSpPr, nvSpPr > cNvSpPr')
        .first();
      const txBoxAttr = cNvSpPr.attr('txBox');
      const isTxBox = txBoxAttr === '1' || txBoxAttr === 'true';

      const nvPr = $shape.find('p\\:nvSpPr > p\\:nvPr, nvSpPr > nvPr').first();
      const isPlaceholder = nvPr.find('p\\:ph, ph').length > 0;

      const isTextBox = isTxBox || isPlaceholder;

      const hasMetadata = metadata && Object.keys(metadata).length > 0;

      shapeTexts.push({
        text: fullText,
        rowIndex: 0, // PPTXにはrowIndexの概念がないため0固定
        ...(hasMetadata && { metadata }),
        ...(drawingObjectId !== undefined &&
          !isNaN(drawingObjectId) && { drawingObjectId }),
        ...(isTextBox && { isTextBox }),
      });
    });

    return shapeTexts;
  }

  /**
   * スライドXMLからコネクタ情報を抽出する
   */
  parseConnectors(slideXml: string): DrawingConnector[] {
    const $ = cheerio.load(slideXml, { xml: true });
    const connectors: DrawingConnector[] = [];

    // mc:Fallback要素を除去して重複抽出を防止
    $('mc\\:Fallback, Fallback').remove();

    const cxnSps = $('p\\:cxnSp, cxnSp');
    cxnSps.each((_, cxnSp) => {
      const $cxnSp = $(cxnSp);
      const connector: DrawingConnector = { rowIndex: 0 };

      const spPr = $cxnSp.find('p\\:spPr, spPr').first();
      if (spPr.length > 0) {
        const prstGeom = spPr.find('a\\:prstGeom, prstGeom').first();
        const prst = prstGeom.attr('prst');
        if (prst) {
          connector.metadata = { presetGeometry: prst };
        }

        const xfrm = spPr.find('a\\:xfrm, xfrm').first();
        if (xfrm.length > 0) {
          if (xfrm.attr('flipH') === '1') connector.flipH = true;
          if (xfrm.attr('flipV') === '1') connector.flipV = true;
        }

        // 位置・サイズ情報を取得
        const position = this.extractPositionFromSpPr(spPr);
        if (position) {
          if (!connector.metadata) {
            connector.metadata = {};
          }
          connector.metadata.position = position;
        }

        const ln = spPr.find('a\\:ln, ln').first();
        if (ln.length > 0) {
          const headEnd = ln.find('a\\:headEnd, headEnd').first();
          const tailEnd = ln.find('a\\:tailEnd, tailEnd').first();
          if (headEnd.length > 0) {
            connector.headEndType = headEnd.attr('type') ?? 'none';
          }
          if (tailEnd.length > 0) {
            connector.tailEndType = tailEnd.attr('type') ?? 'none';
          }
        }
      }

      const cNvCxnSpPr = $cxnSp.find('p\\:cNvCxnSpPr, cNvCxnSpPr').first();
      if (cNvCxnSpPr.length > 0) {
        const stCxn = cNvCxnSpPr.find('a\\:stCxn, stCxn').first();
        if (stCxn.length > 0) {
          const stId = parseInt(stCxn.attr('id') ?? '', 10);
          const stIdx = parseInt(stCxn.attr('idx') ?? '0', 10);
          if (!isNaN(stId)) {
            connector.startConnection = {
              drawingObjectId: stId,
              connectionSiteIndex: isNaN(stIdx) ? 0 : stIdx,
            } satisfies ConnectionInfo;
          }
        }

        const endCxn = cNvCxnSpPr.find('a\\:endCxn, endCxn').first();
        if (endCxn.length > 0) {
          const endId = parseInt(endCxn.attr('id') ?? '', 10);
          const endIdx = parseInt(endCxn.attr('idx') ?? '0', 10);
          if (!isNaN(endId)) {
            connector.endConnection = {
              drawingObjectId: endId,
              connectionSiteIndex: isNaN(endIdx) ? 0 : endIdx,
            } satisfies ConnectionInfo;
          }
        }
      }

      connectors.push(connector);
    });

    return connectors;
  }

  /**
   * スライドXMLからテーブルを抽出する
   */
  parseTables(slideXml: string): PptxTable[] {
    const $ = cheerio.load(slideXml, { xml: true });
    const tables: PptxTable[] = [];

    // mc:Fallback要素を除去して重複抽出を防止
    $('mc\\:Fallback, Fallback').remove();

    const tbls = $('a\\:tbl, tbl');
    tbls.each((_, tbl) => {
      const rows: string[][] = [];
      const trs = $(tbl).find('a\\:tr, tr');
      trs.each((_, tr) => {
        const cells: string[] = [];
        const tcs = $(tr).find('a\\:tc, tc');
        tcs.each((_, tc) => {
          const $tc = $(tc);

          // vMerge属性あり（rowSpan未指定）の場合は継続セルとして空セルにする
          const vMergeAttr = $tc.attr('vMerge');
          if (vMergeAttr !== undefined && vMergeAttr !== null) {
            cells.push('');
            return;
          }

          // hMerge属性ありの場合はgridSpanの被マージセルとしてスキップする
          // gridSpan処理で空セルが追加されるため、ここでは何もしない
          const hMergeAttr = $tc.attr('hMerge');
          if (hMergeAttr !== undefined && hMergeAttr !== null) {
            return;
          }

          // セル内の段落ごとにテキストを抽出し、段落間を改行で結合
          const paragraphs: string[] = [];
          $tc.find('a\\:p, p').each((_, p) => {
            const texts: string[] = [];
            $(p)
              .find('a\\:t, t')
              .each((_, t) => {
                const text = $(t).text();
                if (text) {
                  texts.push(text);
                }
              });
            paragraphs.push(texts.join(''));
          });
          const cellText = paragraphs.join('\n');
          cells.push(cellText);

          // gridSpan > 1の場合、一部ツールがhMerge属性を生成しないことがあるため
          // 明示的に空セルを追加する（hMergeセルは重複防止のためスキップ済み）
          const gridSpanAttr = $tc.attr('gridSpan');
          if (gridSpanAttr) {
            const gridSpan = parseInt(gridSpanAttr, 10);
            if (gridSpan > 1) {
              for (let i = 1; i < gridSpan; i++) {
                cells.push('');
              }
            }
          }
        });
        rows.push(cells);
      });

      if (rows.length > 0) {
        tables.push({ rows });
      }
    });

    return tables;
  }

  /**
   * リレーションシップXMLからrIdとターゲットパスのマッピングを抽出する
   */
  parseRelationships(relsXml: string): RelationshipEntry[] {
    return parseRelationships(relsXml);
  }

  /**
   * 画像のrIdをZIP内の画像パスに解決する
   */
  resolveImagePaths(
    images: PptxImage[],
    relationships: RelationshipEntry[],
    slideDir: string,
  ): Map<string, string> {
    return resolveImagePaths(images, relationships, slideDir);
  }

  /**
   * CSVセルをRFC 4180準拠でエスケープする
   * - 改行・カンマ・ダブルクォートを含む場合はダブルクォートで囲む
   * - 改行はそのまま保持する
   */
  escapeCsvCell(value: string): string {
    return escapeCsvCellUtil(value);
  }

  /**
   * 図形要素のtxBodyからテキストを抽出する
   */
  private extractShapeText(
    $: cheerio.CheerioAPI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txBody: cheerio.Cheerio<any>,
  ): string {
    const paragraphTexts: string[] = [];
    txBody.find('a\\:p, p').each((_, p) => {
      const texts: string[] = [];
      $(p)
        .find('a\\:t, t')
        .each((_, t) => {
          const text = $(t).text();
          if (text) {
            texts.push(text);
          }
        });
      if (texts.length > 0) {
        paragraphTexts.push(texts.join(''));
      }
    });
    return paragraphTexts.join('\n').trim();
  }

  /**
   * spPr要素から位置・サイズ情報を抽出する
   */
  private extractPositionFromSpPr(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spPr: cheerio.Cheerio<any>,
  ): PositionInfo | undefined {
    const xfrm = spPr.find('a\\:xfrm, xfrm').first();
    if (xfrm.length === 0) return undefined;

    const off = xfrm.find('a\\:off, off').first();
    const ext = xfrm.find('a\\:ext, ext').first();
    if (off.length === 0 || ext.length === 0) return undefined;

    const x = parseInt(off.attr('x') ?? '', 10);
    const y = parseInt(off.attr('y') ?? '', 10);
    const cx = parseInt(ext.attr('cx') ?? '', 10);
    const cy = parseInt(ext.attr('cy') ?? '', 10);

    if (isNaN(x) || isNaN(y) || isNaN(cx) || isNaN(cy)) return undefined;

    return {
      x: emuToCm(x),
      y: emuToCm(y),
      cx: emuToCm(cx),
      cy: emuToCm(cy),
    };
  }

  /**
   * 図形要素からメタデータ（種類）を抽出する
   */
  private extractShapeMetadata(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $shape: cheerio.Cheerio<any>,
  ): ShapeMetadata | undefined {
    const spPr = $shape.find('p\\:spPr, spPr').first();
    if (spPr.length === 0) return undefined;

    const metadata: ShapeMetadata = {};

    const prstGeom = spPr.find('a\\:prstGeom, prstGeom').first();
    const prst = prstGeom.attr('prst');
    if (prst) {
      metadata.presetGeometry = prst;
    }

    const position = this.extractPositionFromSpPr(spPr);
    if (position) {
      metadata.position = position;
    }

    if (Object.keys(metadata).length === 0) return undefined;
    return metadata;
  }
}
