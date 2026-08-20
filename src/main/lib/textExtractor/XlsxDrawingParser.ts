import * as cheerio from 'cheerio';

/**
 * セル範囲情報（アンカーから抽出）
 */
export interface CellRange {
  /** 開始列（0ベース） */
  fromCol: number;
  /** 開始行（0ベース） */
  fromRow: number;
  /** 終了列（twoCellAnchorの場合のみ） */
  toCol?: number;
  /** 終了行（twoCellAnchorの場合のみ） */
  toRow?: number;
}

/**
 * DrawingMLから抽出した画像情報
 */
export interface DrawingImage {
  /** リレーションシップID（rIdN） */
  rId: string;
  /** アンカー内の行インデックス（ソート用） */
  rowIndex: number;
  /** セル範囲情報 */
  cellRange?: CellRange;
}

/**
 * 位置・サイズ情報（cm単位）
 */
export interface PositionInfo {
  /** X座標（cm） */
  x: number;
  /** Y座標（cm） */
  y: number;
  /** 幅（cm） */
  cx: number;
  /** 高さ（cm） */
  cy: number;
}

/**
 * 図形のメタデータ（種類・セル範囲・位置）
 */
export interface ShapeMetadata {
  /** プリセットジオメトリ（"rect", "ellipse", "roundRect" 等） */
  presetGeometry?: string;
  /** セル範囲情報 */
  cellRange?: CellRange;
  /** 位置・サイズ情報（cm単位） */
  position?: PositionInfo;
}

/**
 * DrawingMLから抽出した図形テキスト
 */
export interface DrawingShapeText {
  /** 図形内テキスト */
  text: string;
  /** アンカー内の行インデックス（ソート用） */
  rowIndex: number;
  /** 図形メタデータ */
  metadata?: ShapeMetadata;
  /** DrawingML上のオブジェクトID（<xdr:cNvPr id=>） */
  drawingObjectId?: number;
  /** テキストコンテナかどうか（PresentationMLのtxBox属性またはプレースホルダー要素に基づく） */
  isTextBox?: boolean;
}

/**
 * コネクタの接続先情報
 */
export interface ConnectionInfo {
  /** DrawingML上のオブジェクトID（cNvPr id） */
  drawingObjectId: number;
  /** 接続ポイントインデックス */
  connectionSiteIndex: number;
}

/**
 * コネクタ（矢印・線）情報
 */
export interface DrawingConnector {
  /** アンカー内の行インデックス（ソート用） */
  rowIndex: number;
  /** 図形メタデータ（種類・セル範囲） */
  metadata?: ShapeMetadata;
  /** 開始接続先（<a:stCxn>） */
  startConnection?: ConnectionInfo;
  /** 終了接続先（<a:endCxn>） */
  endConnection?: ConnectionInfo;
  /** 矢印の始点タイプ（"none" | "triangle" | "stealth" 等） */
  headEndType?: string;
  /** 矢印の終端タイプ（"none" | "triangle" | "stealth" 等） */
  tailEndType?: string;
  /** 水平フリップ（<a:xfrm flipH="1">） */
  flipH?: boolean;
  /** 垂直フリップ（<a:xfrm flipV="1">） */
  flipV?: boolean;
}

/**
 * リレーションシップ情報
 */
export interface RelationshipEntry {
  /** リレーションシップID */
  rId: string;
  /** ターゲットパス（相対パス） */
  target: string;
  /** リレーションシップタイプ（Type属性） */
  type?: string;
}

/** OOXML仕様のdrawingリレーションシップタイプ（Transitional） */
export const DRAWING_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';

/** OOXML仕様のdrawingリレーションシップタイプ（Strict） */
export const DRAWING_RELATIONSHIP_TYPE_STRICT =
  'http://purl.oclc.org/ooxml/officeDocument/relationships/drawing';

/**
 * 0ベース列インデックスをExcel列文字に変換する
 * @param col 0ベース列インデックス（0→A, 25→Z, 26→AA）
 * @returns Excel列文字
 */
export function colToExcelLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

/**
 * CellRangeをExcel A1記法の文字列に変換する
 * @param cellRange セル範囲情報
 * @returns A1記法文字列（例: "A1-C3", "B6"）
 */
export function formatCellRange(cellRange: CellRange): string {
  const fromCell = `${colToExcelLetter(cellRange.fromCol)}${cellRange.fromRow + 1}`;
  if (cellRange.toCol !== undefined && cellRange.toRow !== undefined) {
    const toCell = `${colToExcelLetter(cellRange.toCol)}${cellRange.toRow + 1}`;
    return `${fromCell}-${toCell}`;
  }
  return fromCell;
}

/** EMUからcmへの変換定数（1cm = 360,000 EMU） */
const EMU_PER_CM = 360_000;

/**
 * EMU（English Metric Unit）をcm（センチメートル）に変換する
 * @param emu EMU値
 * @returns cm値（小数点1桁）
 */
export function emuToCm(emu: number): number {
  return Number((emu / EMU_PER_CM).toFixed(1));
}

/**
 * PositionInfoをフォーマット文字列に変換する
 * @param position 位置・サイズ情報
 * @returns フォーマット済み文字列（例: "p:2.5,5.1 sz:7.6,3.8"）
 */
export function formatPosition(position: PositionInfo): string {
  return `p:${position.x.toFixed(1)},${position.y.toFixed(1)} sz:${position.cx.toFixed(1)},${position.cy.toFixed(1)}`;
}

/**
 * 画像タグ文字列を生成する
 * @param referenceId 画像参照ID（例: "image_1.png"）
 * @param cellRange セル範囲情報（オプション、XLSX用）
 * @param position 位置・サイズ情報（オプション、PPTX用）
 * @returns 画像タグ（例: "![image p:2.5,5.1 sz:7.6,3.8](image_1.png)", "![image at A6-C11](image_1.png)"）
 */
export function formatImageTag(
  referenceId: string,
  cellRange?: CellRange,
  position?: PositionInfo,
): string {
  const parts: string[] = ['image'];

  if (position) {
    parts.push(formatPosition(position));
  }

  if (cellRange) {
    parts.push(`at ${formatCellRange(cellRange)}`);
  }

  return `![${parts.join(' ')}](${referenceId})`;
}

/**
 * IDとメタデータを含むフルタグ文字列を生成する
 * @param id 描画要素のID（例: "shape1", "connector3"）
 * @param metadata 図形メタデータ（オプション）
 * @param connectionPart 接続情報文字列（オプション。例: "shape1->shape2", "A3--D6"）
 * @returns フルタグ（例: "[shape1:rect@A1-C3]", "[connector3:straightConnector1 shape1->shape2]"）
 */
export function formatDrawingTagFull(
  id: string,
  metadata?: ShapeMetadata,
  connectionPart?: string,
): string {
  const parts: string[] = [];

  // IDと種類
  if (metadata?.presetGeometry) {
    parts.push(`${id}:${metadata.presetGeometry}`);
  } else {
    parts.push(id);
  }

  // 接続情報（コネクタ用）
  if (connectionPart) {
    parts.push(connectionPart);
  }

  // 位置・サイズ情報
  if (metadata?.position) {
    parts.push(formatPosition(metadata.position));
  }

  // セル範囲（スペースなしで@で直接連結）
  const cellRangeSuffix = metadata?.cellRange
    ? `@${formatCellRange(metadata.cellRange)}`
    : '';

  return `[${parts.join(' ')}${cellRangeSuffix}]`;
}

/**
 * IDのみの短縮タグ文字列を生成する
 * @param id 描画要素のID（例: "shape_1"）
 * @returns 短縮タグ（例: "[shape_1]"）
 */
export function formatDrawingTagShort(id: string): string {
  return `[${id}]`;
}

/**
 * 矢印の始点/終端タイプからシンボルを判定する
 * @param headEndType 始点の矢印タイプ（"none", "triangle", "stealth" 等）
 * @param tailEndType 終端の矢印タイプ（"none", "triangle", "stealth" 等）
 * @returns 矢印シンボル（"->", "<-", "<->", "--"）
 */
export function getArrowSymbol(
  headEndType?: string,
  tailEndType?: string,
): string {
  const hasHead = headEndType !== undefined && headEndType !== 'none';
  const hasTail = tailEndType !== undefined && tailEndType !== 'none';

  if (hasHead && hasTail) return '<->';
  if (hasHead) return '<-';
  if (hasTail) return '->';
  return '--';
}

/**
 * コネクタのフリップ情報を考慮して始点/終点セル文字列を算出する
 * flipH/flipVがある場合、描画上の視覚的な始点/終点が入れ替わる
 * @param cellRange セル範囲情報（twoCellAnchorのfrom/to）
 * @param flipH 水平フリップ
 * @param flipV 垂直フリップ
 * @returns [始点セル文字列, 終点セル文字列]（例: ["A3", "D6"]）
 */
export function resolveConnectorEndpoints(
  cellRange: CellRange,
  flipH?: boolean,
  flipV?: boolean,
): [string, string] {
  const fromCol = cellRange.fromCol;
  const fromRow = cellRange.fromRow;
  const toCol = cellRange.toCol ?? cellRange.fromCol;
  const toRow = cellRange.toRow ?? cellRange.fromRow;

  // フリップにより視覚的な始点/終点が入れ替わる
  const startCol = flipH ? toCol : fromCol;
  const startRow = flipV ? toRow : fromRow;
  const endCol = flipH ? fromCol : toCol;
  const endRow = flipV ? fromRow : toRow;

  const startCell = `${colToExcelLetter(startCol)}${startRow + 1}`;
  const endCell = `${colToExcelLetter(endCol)}${endRow + 1}`;

  return [startCell, endCell];
}

/**
 * リレーションシップXMLからrIdとターゲットパスのマッピングを抽出する
 * @param relsXml リレーションシップXMLコンテンツ
 * @returns リレーションシップエントリの配列
 */
export function parseRelationships(relsXml: string): RelationshipEntry[] {
  const $ = cheerio.load(relsXml, { xml: true });
  const entries: RelationshipEntry[] = [];

  $('Relationship').each((_, rel) => {
    const rId = $(rel).attr('Id');
    const target = $(rel).attr('Target');
    const type = $(rel).attr('Type');
    if (rId && target) {
      entries.push({ rId, target, ...(type && { type }) });
    }
  });

  return entries;
}

/**
 * 相対パスをベースディレクトリからの絶対パスに解決する
 * @param baseDir ベースディレクトリ（例: "xl/drawings", "ppt/slides"）
 * @param relativePath 相対パス（例: "../media/image1.png"）
 * @returns 解決済みパス（例: "xl/media/image1.png"）
 */
export function resolveRelativePath(
  baseDir: string,
  relativePath: string,
): string {
  // 絶対パスの場合はそのまま返す（先頭の/は除去）
  if (relativePath.startsWith('/')) {
    return relativePath.slice(1);
  }

  const baseParts = baseDir.split('/').filter(Boolean);
  const relParts = relativePath.split('/');

  for (const part of relParts) {
    if (part === '..') {
      baseParts.pop();
    } else if (part !== '.') {
      baseParts.push(part);
    }
  }

  return baseParts.join('/');
}

/**
 * 画像のrIdをZIP内の画像パスに解決する
 * @param images rIdを持つオブジェクトの配列（DrawingImage, PptxImage等）
 * @param relationships parseRelationshipsの結果
 * @param baseDir ファイルが存在するディレクトリ（例: "xl/drawings", "ppt/slides"）
 * @returns rIdからZIP内画像パスへのマッピング
 */
export function resolveImagePaths(
  images: { rId: string }[],
  relationships: RelationshipEntry[],
  baseDir: string,
): Map<string, string> {
  const relMap = new Map(relationships.map((r) => [r.rId, r.target]));
  const result = new Map<string, string>();

  for (const image of images) {
    const target = relMap.get(image.rId);
    if (target) {
      const resolvedPath = resolveRelativePath(baseDir, target);
      result.set(image.rId, resolvedPath);
    }
  }

  return result;
}

/**
 * Excel DrawingML XMLパーサー
 * .xlsx内のdrawingN.xmlとリレーションシップXMLを解析して
 * 画像情報と図形テキストを抽出する
 */
export class XlsxDrawingParser {
  /**
   * DrawingXMLから画像情報を抽出する
   */
  parseImages(drawingXml: string): DrawingImage[] {
    const $ = cheerio.load(drawingXml, { xml: true });
    const images: DrawingImage[] = [];

    // mc:Fallback要素を除去して重複抽出を防止（Office 2010+のAlternateContent対応）
    $('mc\\:Fallback, Fallback').remove();

    const anchors = $(
      'xdr\\:twoCellAnchor, twoCellAnchor, xdr\\:oneCellAnchor, oneCellAnchor, xdr\\:absoluteAnchor, absoluteAnchor',
    );

    anchors.each((_, anchor) => {
      const $anchor = $(anchor);
      const cellRange = this.extractAnchorCellRange($, $anchor);
      const rowIndex = cellRange?.fromRow ?? 0;

      const pics = $anchor.find('xdr\\:pic, pic');
      pics.each((_, pic) => {
        const blipFill = $(pic).find('xdr\\:blipFill, blipFill');
        const blip = blipFill.find('a\\:blip, blip');
        const rId = blip.attr('r:embed') || blip.attr('r:link');
        if (rId) {
          images.push({
            rId,
            rowIndex,
            ...(cellRange && { cellRange }),
          });
        }
      });
    });

    return images;
  }

  /**
   * DrawingXMLから図形内テキストを抽出する
   */
  parseShapeTexts(drawingXml: string): DrawingShapeText[] {
    const $ = cheerio.load(drawingXml, { xml: true });
    const shapeTexts: DrawingShapeText[] = [];

    // mc:Fallback要素を除去して重複抽出を防止
    $('mc\\:Fallback, Fallback').remove();

    const anchors = $(
      'xdr\\:twoCellAnchor, twoCellAnchor, xdr\\:oneCellAnchor, oneCellAnchor, xdr\\:absoluteAnchor, absoluteAnchor',
    );

    anchors.each((_, anchor) => {
      const $anchor = $(anchor);
      const cellRange = this.extractAnchorCellRange($, $anchor);
      const rowIndex = cellRange?.fromRow ?? 0;

      const shapes = $anchor.find('xdr\\:sp, sp');
      shapes.each((_, shape) => {
        const $shape = $(shape);
        const txBody = $shape.find('xdr\\:txBody, txBody');
        if (txBody.length === 0) return;

        const fullText = this.extractShapeText($, txBody);
        if (fullText) {
          const shapeMetadata = this.extractShapeMetadata($shape);

          const metadata: ShapeMetadata = {
            ...(shapeMetadata ?? {}),
            ...(cellRange && { cellRange }),
          };

          const hasMetadata = Object.keys(metadata).length > 0;

          const cNvPr = $shape
            .find('xdr\\:nvSpPr > xdr\\:cNvPr, nvSpPr > cNvPr')
            .first();
          const idAttr = cNvPr.attr('id');
          const drawingObjectId = idAttr ? parseInt(idAttr, 10) : undefined;

          shapeTexts.push({
            text: fullText,
            rowIndex,
            ...(hasMetadata && { metadata }),
            ...(drawingObjectId !== undefined &&
              !isNaN(drawingObjectId) && { drawingObjectId }),
          });
        }
      });
    });

    return shapeTexts;
  }

  /**
   * DrawingXMLからコネクタ（矢印・線）情報を抽出する
   */
  parseConnectors(drawingXml: string): DrawingConnector[] {
    const $ = cheerio.load(drawingXml, { xml: true });
    const connectors: DrawingConnector[] = [];

    // mc:Fallback要素を除去して重複抽出を防止
    $('mc\\:Fallback, Fallback').remove();

    const anchors = $(
      'xdr\\:twoCellAnchor, twoCellAnchor, xdr\\:oneCellAnchor, oneCellAnchor, xdr\\:absoluteAnchor, absoluteAnchor',
    );

    anchors.each((_, anchor) => {
      const $anchor = $(anchor);
      const cellRange = this.extractAnchorCellRange($, $anchor);
      const rowIndex = cellRange?.fromRow ?? 0;

      const cxnSps = $anchor.find('xdr\\:cxnSp, cxnSp');
      cxnSps.each((_, cxnSp) => {
        const $cxnSp = $(cxnSp);
        const connector: DrawingConnector = { rowIndex };

        const spPr = $cxnSp.find('xdr\\:spPr, spPr').first();
        if (spPr.length > 0) {
          const prstGeom = spPr.find('a\\:prstGeom, prstGeom').first();
          const prst = prstGeom.attr('prst');
          if (prst) {
            connector.metadata = {
              presetGeometry: prst,
              ...(cellRange && { cellRange }),
            };
          } else if (cellRange) {
            connector.metadata = { cellRange };
          }

          const xfrm = spPr.find('a\\:xfrm, xfrm').first();
          if (xfrm.length > 0) {
            if (xfrm.attr('flipH') === '1') connector.flipH = true;
            if (xfrm.attr('flipV') === '1') connector.flipV = true;
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
        } else if (cellRange) {
          connector.metadata = { cellRange };
        }

        const cNvCxnSpPr = $cxnSp.find('xdr\\:cNvCxnSpPr, cNvCxnSpPr').first();
        if (cNvCxnSpPr.length > 0) {
          const stCxn = cNvCxnSpPr.find('a\\:stCxn, stCxn').first();
          if (stCxn.length > 0) {
            const stId = parseInt(stCxn.attr('id') ?? '', 10);
            const stIdx = parseInt(stCxn.attr('idx') ?? '0', 10);
            if (!isNaN(stId)) {
              connector.startConnection = {
                drawingObjectId: stId,
                connectionSiteIndex: isNaN(stIdx) ? 0 : stIdx,
              };
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
              };
            }
          }
        }

        connectors.push(connector);
      });
    });

    return connectors;
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
    images: DrawingImage[],
    relationships: RelationshipEntry[],
    drawingDir: string,
  ): Map<string, string> {
    return resolveImagePaths(images, relationships, drawingDir);
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
   * 図形要素からメタデータ（種類）を抽出する
   */
  private extractShapeMetadata(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $shape: cheerio.Cheerio<any>,
  ): ShapeMetadata | undefined {
    const spPr = $shape.find('xdr\\:spPr, spPr').first();
    if (spPr.length === 0) return undefined;

    const metadata: ShapeMetadata = {};

    const prstGeom = spPr.find('a\\:prstGeom, prstGeom').first();
    const prst = prstGeom.attr('prst');
    if (prst) {
      metadata.presetGeometry = prst;
    }

    if (Object.keys(metadata).length === 0) return undefined;

    return metadata;
  }

  /**
   * アンカー要素からセル範囲情報を抽出する
   */
  private extractAnchorCellRange(
    _$: cheerio.CheerioAPI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $anchor: cheerio.Cheerio<any>,
  ): CellRange | undefined {
    const fromCol = $anchor
      .find('xdr\\:from > xdr\\:col, from > col')
      .first()
      .text();
    const fromRow = $anchor
      .find('xdr\\:from > xdr\\:row, from > row')
      .first()
      .text();

    if (!fromRow && !fromCol) return undefined;

    const parsedFromCol = parseInt(fromCol, 10);
    const parsedFromRow = parseInt(fromRow, 10);

    if (isNaN(parsedFromRow) && isNaN(parsedFromCol)) return undefined;

    const cellRange: CellRange = {
      fromCol: isNaN(parsedFromCol) ? 0 : parsedFromCol,
      fromRow: isNaN(parsedFromRow) ? 0 : parsedFromRow,
    };

    const toCol = $anchor.find('xdr\\:to > xdr\\:col, to > col').first().text();
    const toRow = $anchor.find('xdr\\:to > xdr\\:row, to > row').first().text();

    if (toCol && toRow) {
      const parsedToCol = parseInt(toCol, 10);
      const parsedToRow = parseInt(toRow, 10);
      if (!isNaN(parsedToCol)) cellRange.toCol = parsedToCol;
      if (!isNaN(parsedToRow)) cellRange.toRow = parsedToRow;
    }

    return cellRange;
  }

  /**
   * 相対パスをベースディレクトリからの絶対パスに解決する
   */
  resolveRelativePath(baseDir: string, relativePath: string): string {
    return resolveRelativePath(baseDir, relativePath);
  }
}
