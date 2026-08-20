/**
 * PptxSlideParser のテスト
 * @jest-environment node
 */

import {
  PptxSlideParser,
  type PptxImage,
} from '@/main/lib/textExtractor/PptxSlideParser';
import type { RelationshipEntry } from '@/main/lib/textExtractor/XlsxDrawingParser';

describe('PptxSlideParser', () => {
  let parser: PptxSlideParser;

  beforeEach(() => {
    parser = new PptxSlideParser();
  });

  describe('parseImages', () => {
    describe('正常系', () => {
      it('p:pic要素から画像情報が抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ rId: 'rId2' });
      });

      it('r:link属性の画像も抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip r:link="rId5"/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rId).toBe('rId5');
      });

      it('複数の画像が抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
    </p:pic>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
    </p:pic>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId3"/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(3);
        expect(result[0].rId).toBe('rId1');
        expect(result[1].rId).toBe('rId2');
        expect(result[2].rId).toBe('rId3');
      });

      it('spPr内のxfrmから位置・サイズ情報が抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
      <p:spPr>
        <a:xfrm>
          <a:off x="900000" y="1800000"/>
          <a:ext cx="2700000" cy="1440000"/>
        </a:xfrm>
      </p:spPr>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rId).toBe('rId2');
        expect(result[0].position).toEqual({
          x: 2.5,
          y: 5.0,
          cx: 7.5,
          cy: 4.0,
        });
      });

      it('spPrなしの画像はpositionがundefinedになること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].position).toBeUndefined();
      });
    });

    describe('異常系', () => {
      it('blip要素にr:embed/r:linkがない場合、画像が抽出されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:pic>
      <p:blipFill><a:blip/></p:blipFill>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(0);
      });

      it('pic要素がないスライドXMLで空配列が返ること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('parseShapeTexts', () => {
    describe('正常系', () => {
      it('テキストボックス（txBox="1"）からテキストが抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="4" name="TextBox1"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Hello');
        expect(result[0].rowIndex).toBe(0);
        expect(result[0].drawingObjectId).toBe(4);
        expect(result[0].isTextBox).toBe(true);
        expect(result[0].metadata).toEqual({ presetGeometry: 'rect' });
      });

      it('プレースホルダー要素がある図形がテキストコンテナとして認識されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="2" name="Title1"/>
        <p:cNvSpPr/>
        <p:nvPr><p:ph type="title"/></p:nvPr>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody><a:p><a:r><a:t>Title Text</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Title Text');
        expect(result[0].isTextBox).toBe(true);
      });

      it('txBoxでもプレースホルダーでもない図形はisTextBoxが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="10" name="Shape1"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="ellipse"/></p:spPr>
      <p:txBody><a:p><a:r><a:t>ShapeText</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('ShapeText');
        expect(result[0].isTextBox).toBeUndefined();
        expect(result[0].metadata).toEqual({ presetGeometry: 'ellipse' });
      });

      it('複数パラグラフのテキストが改行で結合されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="3" name="Text1"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody>
        <a:p><a:r><a:t>Line1</a:t></a:r></a:p>
        <a:p><a:r><a:t>Line2</a:t></a:r></a:p>
        <a:p><a:r><a:t>Line3</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Line1\nLine2\nLine3');
      });

      it('複数run要素が結合されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="6" name="MultiRun"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody>
        <a:p>
          <a:r><a:t>Part1</a:t></a:r>
          <a:r><a:t>Part2</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Part1Part2');
      });

      it('位置情報を持つ図形のmetadataにpositionが含まれること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="7" name="PosShape"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="360000" y="720000"/>
          <a:ext cx="1080000" cy="1440000"/>
        </a:xfrm>
        <a:prstGeom prst="roundRect"/>
      </p:spPr>
      <p:txBody><a:p><a:r><a:t>Positioned</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          presetGeometry: 'roundRect',
          position: { x: 1.0, y: 2.0, cx: 3.0, cy: 4.0 },
        });
      });
    });

    describe('異常系', () => {
      it('txBodyがない図形は抽出されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="5" name="NoBody"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(0);
      });

      it('テキストが空の図形は抽出されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="8" name="Empty"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody><a:p></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(0);
      });

      it('cNvPr要素がない場合、drawingObjectIdが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:spPr><a:prstGeom prst="rect"/></p:spPr>
      <p:txBody><a:p><a:r><a:t>NoId</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].drawingObjectId).toBeUndefined();
      });

      it('spPr要素がない場合、metadataが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="11" name="NoSpPr"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>NoMetadata</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toBeUndefined();
      });

      it('prstGeomも位置情報もない場合、metadataが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="12" name="EmptySpPr"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr></p:spPr>
      <p:txBody><a:p><a:r><a:t>EmptyMeta</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toBeUndefined();
      });

      it('sp要素がないスライドXMLで空配列が返ること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('parseConnectors', () => {
    describe('正常系', () => {
      it('コネクタ情報が抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvCxnSpPr>
          <a:stCxn id="4" idx="2"/>
          <a:endCxn id="5" idx="0"/>
        </p:cNvCxnSpPr>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="360000" y="720000"/>
          <a:ext cx="1080000" cy="1440000"/>
        </a:xfrm>
        <a:prstGeom prst="straightConnector1"/>
        <a:ln>
          <a:headEnd type="none"/>
          <a:tailEnd type="triangle"/>
        </a:ln>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rowIndex).toBe(0);
        expect(result[0].metadata).toEqual({
          presetGeometry: 'straightConnector1',
          position: { x: 1.0, y: 2.0, cx: 3.0, cy: 4.0 },
        });
        expect(result[0].startConnection).toEqual({
          drawingObjectId: 4,
          connectionSiteIndex: 2,
        });
        expect(result[0].endConnection).toEqual({
          drawingObjectId: 5,
          connectionSiteIndex: 0,
        });
        expect(result[0].headEndType).toBe('none');
        expect(result[0].tailEndType).toBe('triangle');
      });

      it('flipH/flipVが正しく抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm flipH="1" flipV="1">
          <a:off x="0" y="0"/>
          <a:ext cx="360000" cy="360000"/>
        </a:xfrm>
        <a:prstGeom prst="bentConnector3"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].flipH).toBe(true);
        expect(result[0].flipV).toBe(true);
      });

      it('headEnd/tailEndのtype属性がない場合、"none"がデフォルトになること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:prstGeom prst="line"/>
        <a:ln>
          <a:headEnd/>
          <a:tailEnd/>
        </a:ln>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].headEndType).toBe('none');
        expect(result[0].tailEndType).toBe('none');
      });

      it('位置情報のみでprstGeomがない場合、positionのみのmetadataが設定されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:off x="360000" y="360000"/>
          <a:ext cx="720000" cy="720000"/>
        </a:xfrm>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          position: { x: 1.0, y: 1.0, cx: 2.0, cy: 2.0 },
        });
      });

      it('接続情報のidx属性がない場合、connectionSiteIndexが0になること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvCxnSpPr>
          <a:stCxn id="10"/>
          <a:endCxn id="11"/>
        </p:cNvCxnSpPr>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection?.connectionSiteIndex).toBe(0);
        expect(result[0].endConnection?.connectionSiteIndex).toBe(0);
      });
    });

    describe('異常系', () => {
      it('spPr要素がない場合、metadataが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toBeUndefined();
      });

      it('stCxnのid属性が不正な場合、startConnectionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvCxnSpPr>
          <a:stCxn id="abc" idx="0"/>
          <a:endCxn id="xyz" idx="0"/>
        </p:cNvCxnSpPr>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('stCxn/endCxnのidx属性が不正な場合、connectionSiteIndexが0になること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvCxnSpPr>
          <a:stCxn id="4" idx="abc"/>
          <a:endCxn id="5" idx="xyz"/>
        </p:cNvCxnSpPr>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toEqual({
          drawingObjectId: 4,
          connectionSiteIndex: 0,
        });
        expect(result[0].endConnection).toEqual({
          drawingObjectId: 5,
          connectionSiteIndex: 0,
        });
      });

      it('stCxn/endCxn要素にid属性がない場合、接続情報が設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:nvCxnSpPr>
        <p:cNvCxnSpPr>
          <a:stCxn idx="0"/>
          <a:endCxn idx="0"/>
        </p:cNvCxnSpPr>
      </p:nvCxnSpPr>
      <p:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('cNvCxnSpPr要素がない場合、接続情報が設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('位置情報のoff/extに不正な値がある場合、positionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:off x="abc" y="def"/>
          <a:ext cx="ghi" cy="jkl"/>
        </a:xfrm>
        <a:prstGeom prst="line"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          presetGeometry: 'line',
        });
        expect(result[0].metadata?.position).toBeUndefined();
      });

      it('xfrm内にoff要素がない場合、positionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:ext cx="360000" cy="360000"/>
        </a:xfrm>
        <a:prstGeom prst="line"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata?.position).toBeUndefined();
      });

      it('xfrm内にext要素がない場合、positionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:off x="360000" y="360000"/>
        </a:xfrm>
        <a:prstGeom prst="line"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata?.position).toBeUndefined();
      });

      it('off要素のx/y属性が欠落している場合、positionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:off/>
          <a:ext cx="360000" cy="360000"/>
        </a:xfrm>
        <a:prstGeom prst="line"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata?.position).toBeUndefined();
      });

      it('ext要素のcx/cy属性が欠落している場合、positionが設定されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:cxnSp>
      <p:spPr>
        <a:xfrm>
          <a:off x="360000" y="360000"/>
          <a:ext/>
        </a:xfrm>
        <a:prstGeom prst="line"/>
      </p:spPr>
    </p:cxnSp>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata?.position).toBeUndefined();
      });

      it('空のスライドXMLで空配列が返ること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('parseTables', () => {
    describe('正常系', () => {
      it('テーブルが正しく抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <a:graphic><a:graphicData>
        <a:tbl>
          <a:tr>
            <a:tc><a:txBody><a:p><a:r><a:t>Header1</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>Header2</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
          <a:tr>
            <a:tc><a:txBody><a:p><a:r><a:t>Cell1</a:t></a:r></a:p></a:txBody></a:tc>
            <a:tc><a:txBody><a:p><a:r><a:t>Cell2</a:t></a:r></a:p></a:txBody></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rows).toEqual([
          ['Header1', 'Header2'],
          ['Cell1', 'Cell2'],
        ]);
      });

      it('複数テーブルが抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <a:graphic><a:graphicData>
        <a:tbl>
          <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Table1</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:graphicFrame>
      <a:graphic><a:graphicData>
        <a:tbl>
          <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Table2</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(2);
        expect(result[0].rows).toEqual([['Table1']]);
        expect(result[1].rows).toEqual([['Table2']]);
      });

      it('複数のt要素が結合されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <a:tbl>
      <a:tr>
        <a:tc>
          <a:txBody>
            <a:p>
              <a:r><a:t>Part1</a:t></a:r>
              <a:r><a:t>Part2</a:t></a:r>
            </a:p>
          </a:txBody>
        </a:tc>
      </a:tr>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rows).toEqual([['Part1Part2']]);
      });

      it('空のセルが空文字列として抽出されること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <a:tbl>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>Data</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p></a:p></a:txBody></a:tc>
      </a:tr>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rows).toEqual([['Data', '']]);
      });

      it('セル内に複数段落がある場合に改行で結合される', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <a:tbl>
      <a:tr>
        <a:tc><a:txBody>
          <a:p><a:r><a:t>段落1</a:t></a:r></a:p>
          <a:p><a:r><a:t>段落2</a:t></a:r></a:p>
        </a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>値2</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rows).toEqual([['段落1\n段落2', '値2']]);
      });

      it('表のCSV化統合テスト: parseTables + escapeCsvCellで改行やカンマを含むセルが正しくCSV化される', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <a:tbl>
      <a:tr>
        <a:tc><a:txBody>
          <a:p><a:r><a:t>段落1</a:t></a:r></a:p>
          <a:p><a:r><a:t>段落2</a:t></a:r></a:p>
        </a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:t>値2</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:t>通常</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody>
          <a:p><a:r><a:t>カンマ,あり</a:t></a:r></a:p>
          <a:p><a:r><a:t>改行あり</a:t></a:r></a:p>
        </a:txBody></a:tc>
      </a:tr>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

        const tables = parser.parseTables(xml);
        // parseTables + escapeCsvCellの統合結果を検証
        const csvLines = tables[0].rows.map((row) =>
          row.map((cell) => parser.escapeCsvCell(cell)).join(','),
        );

        // 1行目: 改行を含むセルがダブルクォートで囲まれる
        expect(csvLines[0]).toBe('"段落1\n段落2",値2');
        // 2行目: カンマと改行の両方を含むセルがダブルクォートで囲まれ、通常セルはそのまま
        expect(csvLines[1]).toBe('通常,"カンマ,あり\n改行あり"');
      });
    });

    describe('異常系', () => {
      it('tbl要素がないスライドXMLで空配列が返ること', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(0);
      });

      it('行がないテーブルは抽出されないこと', () => {
        const xml = `
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <a:tbl>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

        const result = parser.parseTables(xml);
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('parseRelationships', () => {
    describe('正常系', () => {
      it('ユーティリティ関数に委譲されること', () => {
        const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="../media/image1.png"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>
</Relationships>`;

        const result = parser.parseRelationships(relsXml);
        expect(result).toHaveLength(1);
        expect(result[0].rId).toBe('rId1');
        expect(result[0].target).toBe('../media/image1.png');
      });
    });
  });

  describe('resolveImagePaths', () => {
    describe('正常系', () => {
      it('ユーティリティ関数に委譲されること', () => {
        const images: PptxImage[] = [{ rId: 'rId1' }, { rId: 'rId2' }];
        const relationships: RelationshipEntry[] = [
          { rId: 'rId1', target: '../media/image1.png' },
          { rId: 'rId2', target: '../media/image2.jpg' },
        ];
        const result = parser.resolveImagePaths(
          images,
          relationships,
          'ppt/slides',
        );
        expect(result.get('rId1')).toBe('ppt/media/image1.png');
        expect(result.get('rId2')).toBe('ppt/media/image2.jpg');
      });

      it('対応するリレーションシップがない場合、マッピングに含まれないこと', () => {
        const images: PptxImage[] = [{ rId: 'rId99' }];
        const relationships: RelationshipEntry[] = [
          { rId: 'rId1', target: '../media/image1.png' },
        ];
        const result = parser.resolveImagePaths(
          images,
          relationships,
          'ppt/slides',
        );
        expect(result.size).toBe(0);
      });
    });
  });

  describe('escapeCsvCell', () => {
    describe('正常系', () => {
      it('通常の文字列がそのまま返ること', () => {
        expect(parser.escapeCsvCell('hello')).toBe('hello');
      });

      it('カンマを含む文字列がダブルクォートで囲まれること', () => {
        expect(parser.escapeCsvCell('a,b')).toBe('"a,b"');
      });

      it('ダブルクォートを含む文字列がエスケープされること', () => {
        expect(parser.escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
      });

      it('カンマとダブルクォートの両方を含む場合、正しくエスケープされること', () => {
        expect(parser.escapeCsvCell('a,"b"')).toBe('"a,""b"""');
      });

      it('改行を含む場合はダブルクォートで囲んで保持する', () => {
        expect(parser.escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
      });

      it('改行とカンマの両方を含む場合', () => {
        expect(parser.escapeCsvCell('a,b\nc')).toBe('"a,b\nc"');
      });

      it('空文字列がそのまま返ること', () => {
        expect(parser.escapeCsvCell('')).toBe('');
      });
    });
  });
});

describe('PptxSlideParser - mc:AlternateContent重複抽出防止', () => {
  const parser = new PptxSlideParser();

  it('mc:AlternateContent内の画像がmc:Choice側のみ抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <p:cSld><p:spTree>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:pic>
                <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
              </p:pic>
            </mc:Choice>
            <mc:Fallback>
              <p:pic>
                <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
              </p:pic>
            </mc:Fallback>
          </mc:AlternateContent>
        </p:spTree></p:cSld>
      </p:sld>`;

    const images = parser.parseImages(xml);

    expect(images).toHaveLength(1);
    expect(images[0].rId).toBe('rId1');
  });

  it('mc:AlternateContent内の図形テキストが重複なく抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <p:cSld><p:spTree>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:sp>
                <p:nvSpPr><p:cNvPr id="2" name="Shape1"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>新形式テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Choice>
            <mc:Fallback>
              <p:sp>
                <p:nvSpPr><p:cNvPr id="2" name="Shape1"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>旧形式テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Fallback>
          </mc:AlternateContent>
        </p:spTree></p:cSld>
      </p:sld>`;

    const shapes = parser.parseShapeTexts(xml);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('新形式テキスト');
  });

  it('mc:AlternateContent内のコネクタが重複なく抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <p:cSld><p:spTree>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:cxnSp>
                <p:spPr><a:prstGeom prst="straightConnector1"/></p:spPr>
              </p:cxnSp>
            </mc:Choice>
            <mc:Fallback>
              <p:cxnSp>
                <p:spPr><a:prstGeom prst="line"/></p:spPr>
              </p:cxnSp>
            </mc:Fallback>
          </mc:AlternateContent>
        </p:spTree></p:cSld>
      </p:sld>`;

    const connectors = parser.parseConnectors(xml);

    expect(connectors).toHaveLength(1);
    expect(connectors[0].metadata?.presetGeometry).toBe('straightConnector1');
  });

  it('mc:AlternateContent内のテーブルが重複なく抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <p:cSld><p:spTree>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:graphicFrame>
                <a:graphic><a:graphicData>
                  <a:tbl>
                    <a:tr><a:tc><a:txBody><a:p><a:r><a:t>新表</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
                  </a:tbl>
                </a:graphicData></a:graphic>
              </p:graphicFrame>
            </mc:Choice>
            <mc:Fallback>
              <p:graphicFrame>
                <a:graphic><a:graphicData>
                  <a:tbl>
                    <a:tr><a:tc><a:txBody><a:p><a:r><a:t>旧表</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
                  </a:tbl>
                </a:graphicData></a:graphic>
              </p:graphicFrame>
            </mc:Fallback>
          </mc:AlternateContent>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([['新表']]);
  });
});

describe('PptxSlideParser - テーブルのgridSpan/vMerge対応', () => {
  const parser = new PptxSlideParser();

  it('gridSpanで列方向にマージされたセルを空セルで補完する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc gridSpan="2"><a:txBody><a:p><a:r><a:t>マージ</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc hMerge="1"><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>通常</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([['マージ', '', '通常']]);
  });

  it('vMergeで行方向にマージされたセルを空セルで補完する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc rowSpan="2"><a:txBody><a:p><a:r><a:t>マージ開始</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B1</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
                <a:tr>
                  <a:tc vMerge="1"><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B2</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([
      ['マージ開始', 'B1'],
      ['', 'B2'],
    ]);
  });

  it('gridSpanとvMergeが混在するテーブルを正しく処理する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc gridSpan="2" rowSpan="2"><a:txBody><a:p><a:r><a:t>2x2マージ</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc hMerge="1"><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>C1</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
                <a:tr>
                  <a:tc vMerge="1"><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc vMerge="1" hMerge="1"><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>C2</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
                <a:tr>
                  <a:tc><a:txBody><a:p><a:r><a:t>A3</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B3</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>C3</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([
      ['2x2マージ', '', 'C1'],
      ['', '', 'C2'],
      ['A3', 'B3', 'C3'],
    ]);
  });
});

describe('PptxSlideParser - txBox属性の柔軟化', () => {
  const parser = new PptxSlideParser();

  it('txBox="true"のテキストボックスでisTextBox=trueが設定される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="TextBox1"/>
              <p:cNvSpPr txBox="true"/>
            </p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>テキストボックス内容</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree></p:cSld>
      </p:sld>`;

    const shapes = parser.parseShapeTexts(xml);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('テキストボックス内容');
    expect(shapes[0].isTextBox).toBe(true);
  });
});

describe('PptxSlideParser - グループ内要素の再帰的抽出', () => {
  const parser = new PptxSlideParser();

  it('グループ内のコネクタが再帰的に抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:grpSp>
            <p:cxnSp>
              <p:spPr><a:prstGeom prst="straightConnector1"/></p:spPr>
            </p:cxnSp>
            <p:grpSp>
              <p:cxnSp>
                <p:spPr><a:prstGeom prst="bentConnector3"/></p:spPr>
              </p:cxnSp>
            </p:grpSp>
          </p:grpSp>
        </p:spTree></p:cSld>
      </p:sld>`;

    const connectors = parser.parseConnectors(xml);

    expect(connectors).toHaveLength(2);
    expect(connectors[0].metadata?.presetGeometry).toBe('straightConnector1');
    expect(connectors[1].metadata?.presetGeometry).toBe('bentConnector3');
  });
});

describe('PptxSlideParser - gridSpanのhMergeなし対応', () => {
  const parser = new PptxSlideParser();

  it('gridSpanありだがhMerge属性なしの後続セルでも正しく空セル補完する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc gridSpan="3"><a:txBody><a:p><a:r><a:t>3列マージ</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>通常セル</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
                <a:tr>
                  <a:tc><a:txBody><a:p><a:r><a:t>A2</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B2</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>C2</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>D2</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([
      ['3列マージ', '', '', '通常セル'],
      ['A2', 'B2', 'C2', 'D2'],
    ]);
  });

  it('gridSpan=1の通常セルでは空セルが追加されない', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc gridSpan="1"><a:txBody><a:p><a:r><a:t>A1</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc gridSpan="1"><a:txBody><a:p><a:r><a:t>B1</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([['A1', 'B1']]);
  });

  it('vMerge属性値なし（属性存在のみ）のセルを空セルとして処理する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:graphicFrame>
            <a:graphic><a:graphicData>
              <a:tbl>
                <a:tr>
                  <a:tc rowSpan="2"><a:txBody><a:p><a:r><a:t>マージ開始</a:t></a:r></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B1</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
                <a:tr>
                  <a:tc vMerge=""><a:txBody><a:p></a:p></a:txBody></a:tc>
                  <a:tc><a:txBody><a:p><a:r><a:t>B2</a:t></a:r></a:p></a:txBody></a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData></a:graphic>
          </p:graphicFrame>
        </p:spTree></p:cSld>
      </p:sld>`;

    const tables = parser.parseTables(xml);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([
      ['マージ開始', 'B1'],
      ['', 'B2'],
    ]);
  });
});

describe('PptxSlideParser - Strict OOXML名前空間', () => {
  const parser = new PptxSlideParser();

  it('名前空間プレフィックスなしのスライドXMLから画像を抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <sld xmlns="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <cSld><spTree>
          <pic>
            <blipFill>
              <a:blip r:embed="rId2"/>
            </blipFill>
          </pic>
        </spTree></cSld>
      </sld>`;

    const images = parser.parseImages(xml);
    expect(images).toHaveLength(1);
    expect(images[0].rId).toBe('rId2');
  });

  it('名前空間プレフィックスなしのスライドXMLから図形テキストを抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <sld xmlns="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <cSld><spTree>
          <sp>
            <nvSpPr><cNvPr id="2" name="Shape1"/></nvSpPr>
            <txBody>
              <a:p><a:r><a:t>プレフィックスなしテキスト</a:t></a:r></a:p>
            </txBody>
          </sp>
        </spTree></cSld>
      </sld>`;

    const shapes = parser.parseShapeTexts(xml);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('プレフィックスなしテキスト');
  });

  it('グループ図形内の図形テキストを抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:grpSp>
            <p:grpSp>
              <p:sp>
                <p:nvSpPr><p:cNvPr id="7" name="DeepShape"/></p:nvSpPr>
                <p:txBody>
                  <a:p><a:r><a:t>深くネストされた図形</a:t></a:r></a:p>
                </p:txBody>
              </p:sp>
            </p:grpSp>
          </p:grpSp>
        </p:spTree></p:cSld>
      </p:sld>`;

    const shapes = parser.parseShapeTexts(xml);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('深くネストされた図形');
    expect(shapes[0].drawingObjectId).toBe(7);
  });

  it('spPr要素がない最小限図形のテキストを抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="2" name="MinShape"/></p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>最小限図形テキスト</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree></p:cSld>
      </p:sld>`;

    const shapes = parser.parseShapeTexts(xml);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('最小限図形テキスト');
    expect(shapes[0].metadata).toBeUndefined();
  });

  it('複数mc:AlternateContentブロックの要素を正しく抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <p:cSld><p:spTree>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:sp>
                <p:nvSpPr><p:cNvPr id="2" name="Shape1"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>Choice1テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Choice>
            <mc:Fallback>
              <p:sp>
                <p:nvSpPr><p:cNvPr id="2" name="Shape1"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>Fallback1テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Fallback>
          </mc:AlternateContent>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <p:sp>
                <p:nvSpPr><p:cNvPr id="3" name="Shape2"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>Choice2テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Choice>
            <mc:Fallback>
              <p:sp>
                <p:nvSpPr><p:cNvPr id="3" name="Shape2"/></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t>Fallback2テキスト</a:t></a:r></a:p></p:txBody>
              </p:sp>
            </mc:Fallback>
          </mc:AlternateContent>
        </p:spTree></p:cSld>
      </p:sld>`;

    const shapes = parser.parseShapeTexts(xml);
    expect(shapes).toHaveLength(2);
    expect(shapes[0].text).toBe('Choice1テキスト');
    expect(shapes[1].text).toBe('Choice2テキスト');
  });
});
