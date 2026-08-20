/**
 * XlsxDrawingParser のテスト
 * @jest-environment node
 */

import {
  colToExcelLetter,
  formatCellRange,
  emuToCm,
  formatPosition,
  formatImageTag,
  formatDrawingTagFull,
  formatDrawingTagShort,
  getArrowSymbol,
  resolveConnectorEndpoints,
  parseRelationships,
  resolveRelativePath,
  resolveImagePaths,
  XlsxDrawingParser,
  type CellRange,
  type PositionInfo,
  type ShapeMetadata,
} from '@/main/lib/textExtractor/XlsxDrawingParser';

// --- ユーティリティ関数のテスト ---

describe('colToExcelLetter', () => {
  describe('正常系', () => {
    it('0がAに変換されること', () => {
      expect(colToExcelLetter(0)).toBe('A');
    });

    it('25がZに変換されること', () => {
      expect(colToExcelLetter(25)).toBe('Z');
    });

    it('26がAAに変換されること', () => {
      expect(colToExcelLetter(26)).toBe('AA');
    });

    it('27がABに変換されること', () => {
      expect(colToExcelLetter(27)).toBe('AB');
    });

    it('51がAZに変換されること', () => {
      expect(colToExcelLetter(51)).toBe('AZ');
    });

    it('52がBAに変換されること', () => {
      expect(colToExcelLetter(52)).toBe('BA');
    });

    it('701がZZに変換されること', () => {
      expect(colToExcelLetter(701)).toBe('ZZ');
    });

    it('702がAAAに変換されること', () => {
      expect(colToExcelLetter(702)).toBe('AAA');
    });
  });
});

describe('formatCellRange', () => {
  describe('正常系', () => {
    it('fromのみの場合、単一セル記法になること', () => {
      const cellRange: CellRange = { fromCol: 0, fromRow: 0 };
      expect(formatCellRange(cellRange)).toBe('A1');
    });

    it('from/toがある場合、範囲記法になること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 0,
        toCol: 2,
        toRow: 2,
      };
      expect(formatCellRange(cellRange)).toBe('A1-C3');
    });

    it('toColのみがundefinedの場合、単一セル記法になること', () => {
      const cellRange: CellRange = {
        fromCol: 1,
        fromRow: 4,
        toCol: undefined,
        toRow: 9,
      };
      expect(formatCellRange(cellRange)).toBe('B5');
    });

    it('toRowのみがundefinedの場合、単一セル記法になること', () => {
      const cellRange: CellRange = {
        fromCol: 1,
        fromRow: 4,
        toCol: 3,
        toRow: undefined,
      };
      expect(formatCellRange(cellRange)).toBe('B5');
    });

    it('大きな列番号でも正しく変換されること', () => {
      const cellRange: CellRange = {
        fromCol: 26,
        fromRow: 99,
        toCol: 27,
        toRow: 100,
      };
      expect(formatCellRange(cellRange)).toBe('AA100-AB101');
    });
  });
});

describe('emuToCm', () => {
  describe('正常系', () => {
    it('360000EMUが1.0cmに変換されること', () => {
      expect(emuToCm(360000)).toBe(1.0);
    });

    it('0EMUが0.0cmに変換されること', () => {
      expect(emuToCm(0)).toBe(0.0);
    });

    it('180000EMUが0.5cmに変換されること', () => {
      expect(emuToCm(180000)).toBe(0.5);
    });

    it('小数点1桁に丸められること', () => {
      // 100000 / 360000 = 0.2777... → 0.3
      expect(emuToCm(100000)).toBe(0.3);
    });

    it('大きな値でも正しく変換されること', () => {
      // 3600000 / 360000 = 10.0
      expect(emuToCm(3600000)).toBe(10.0);
    });
  });
});

describe('formatPosition', () => {
  describe('正常系', () => {
    it('位置・サイズ情報がフォーマットされること', () => {
      const position: PositionInfo = { x: 2.5, y: 5.1, cx: 7.6, cy: 3.8 };
      expect(formatPosition(position)).toBe('p:2.5,5.1 sz:7.6,3.8');
    });

    it('整数値でも小数点1桁で表示されること', () => {
      const position: PositionInfo = { x: 0, y: 0, cx: 10, cy: 5 };
      expect(formatPosition(position)).toBe('p:0.0,0.0 sz:10.0,5.0');
    });
  });
});

describe('formatImageTag', () => {
  describe('正常系', () => {
    it('cellRangeなしの場合、シンプルなタグが生成されること', () => {
      expect(formatImageTag('image_1.png')).toBe('![image](image_1.png)');
    });

    it('cellRangeありの場合、位置付きタグが生成されること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 5,
        toCol: 2,
        toRow: 10,
      };
      expect(formatImageTag('image_1.png', cellRange)).toBe(
        '![image at A6-C11](image_1.png)',
      );
    });

    it('cellRangeがundefinedの場合、シンプルなタグが生成されること', () => {
      expect(formatImageTag('img.png', undefined)).toBe('![image](img.png)');
    });

    it('positionありの場合、p:/sz:付きタグが生成されること（PPTX用）', () => {
      const position: PositionInfo = { x: 2.5, y: 5.0, cx: 7.5, cy: 4.0 };
      expect(formatImageTag('image_1.png', undefined, position)).toBe(
        '![image p:2.5,5.0 sz:7.5,4.0](image_1.png)',
      );
    });

    it('positionとcellRange両方指定時は両方が出力されること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 5,
        toCol: 2,
        toRow: 10,
      };
      const position: PositionInfo = { x: 1.0, y: 2.0, cx: 3.0, cy: 4.0 };
      expect(formatImageTag('image_1.png', cellRange, position)).toBe(
        '![image p:1.0,2.0 sz:3.0,4.0 at A6-C11](image_1.png)',
      );
    });
  });
});

describe('formatDrawingTagFull', () => {
  describe('正常系', () => {
    it('IDのみの場合、IDだけのタグが生成されること', () => {
      expect(formatDrawingTagFull('shape_1')).toBe('[shape_1]');
    });

    it('メタデータにpresetGeometryがある場合、種類付きタグが生成されること', () => {
      const metadata: ShapeMetadata = { presetGeometry: 'rect' };
      expect(formatDrawingTagFull('shape_1', metadata)).toBe('[shape_1:rect]');
    });

    it('メタデータにcellRangeがある場合、セル範囲付きタグが生成されること', () => {
      const metadata: ShapeMetadata = {
        cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
      };
      expect(formatDrawingTagFull('shape_1', metadata)).toBe('[shape_1@A1-C3]');
    });

    it('メタデータにpositionがある場合、位置付きタグが生成されること', () => {
      const metadata: ShapeMetadata = {
        position: { x: 1.0, y: 2.0, cx: 3.0, cy: 4.0 },
      };
      expect(formatDrawingTagFull('shape_1', metadata)).toBe(
        '[shape_1 p:1.0,2.0 sz:3.0,4.0]',
      );
    });

    it('connectionPartがある場合、接続情報付きタグが生成されること', () => {
      expect(
        formatDrawingTagFull('connector_1', undefined, 'shape_1->shape_2'),
      ).toBe('[connector_1 shape_1->shape_2]');
    });

    it('全情報が揃っている場合、フルタグが生成されること', () => {
      const metadata: ShapeMetadata = {
        presetGeometry: 'straightConnector1',
        position: { x: 1.0, y: 2.0, cx: 3.0, cy: 4.0 },
        cellRange: { fromCol: 0, fromRow: 0, toCol: 5, toRow: 5 },
      };
      expect(
        formatDrawingTagFull('connector_1', metadata, 'shape_1->shape_2'),
      ).toBe(
        '[connector_1:straightConnector1 shape_1->shape_2 p:1.0,2.0 sz:3.0,4.0@A1-F6]',
      );
    });

    it('metadataがundefinedでconnectionPartがある場合', () => {
      expect(formatDrawingTagFull('connector_1', undefined, 'A1--B2')).toBe(
        '[connector_1 A1--B2]',
      );
    });
  });
});

describe('formatDrawingTagShort', () => {
  describe('正常系', () => {
    it('IDのみの短縮タグが生成されること', () => {
      expect(formatDrawingTagShort('shape_1')).toBe('[shape_1]');
    });

    it('コネクタIDでも短縮タグが生成されること', () => {
      expect(formatDrawingTagShort('connector_3')).toBe('[connector_3]');
    });
  });
});

describe('getArrowSymbol', () => {
  describe('正常系', () => {
    it('両端ともundefinedの場合、"--"が返ること', () => {
      expect(getArrowSymbol(undefined, undefined)).toBe('--');
    });

    it('両端とも"none"の場合、"--"が返ること', () => {
      expect(getArrowSymbol('none', 'none')).toBe('--');
    });

    it('tailEndのみが矢印の場合、"->"が返ること', () => {
      expect(getArrowSymbol(undefined, 'triangle')).toBe('->');
    });

    it('tailEndのみが"triangle"でheadEndが"none"の場合、"->"が返ること', () => {
      expect(getArrowSymbol('none', 'triangle')).toBe('->');
    });

    it('headEndのみが矢印の場合、"<-"が返ること', () => {
      expect(getArrowSymbol('triangle', undefined)).toBe('<-');
    });

    it('headEndが"stealth"でtailEndが"none"の場合、"<-"が返ること', () => {
      expect(getArrowSymbol('stealth', 'none')).toBe('<-');
    });

    it('両端が矢印の場合、"<->"が返ること', () => {
      expect(getArrowSymbol('triangle', 'triangle')).toBe('<->');
    });

    it('異なるタイプの矢印でも両端の場合、"<->"が返ること', () => {
      expect(getArrowSymbol('stealth', 'triangle')).toBe('<->');
    });
  });
});

describe('resolveConnectorEndpoints', () => {
  describe('正常系', () => {
    it('フリップなしの場合、fromが始点、toが終点になること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 2,
        toCol: 3,
        toRow: 5,
      };
      expect(resolveConnectorEndpoints(cellRange)).toEqual(['A3', 'D6']);
    });

    it('flipHの場合、列が入れ替わること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 2,
        toCol: 3,
        toRow: 5,
      };
      expect(resolveConnectorEndpoints(cellRange, true, false)).toEqual([
        'D3',
        'A6',
      ]);
    });

    it('flipVの場合、行が入れ替わること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 2,
        toCol: 3,
        toRow: 5,
      };
      expect(resolveConnectorEndpoints(cellRange, false, true)).toEqual([
        'A6',
        'D3',
      ]);
    });

    it('flipH + flipVの場合、列と行の両方が入れ替わること', () => {
      const cellRange: CellRange = {
        fromCol: 0,
        fromRow: 2,
        toCol: 3,
        toRow: 5,
      };
      expect(resolveConnectorEndpoints(cellRange, true, true)).toEqual([
        'D6',
        'A3',
      ]);
    });

    it('toCol/toRowがundefinedの場合、fromの値がデフォルトで使われること', () => {
      const cellRange: CellRange = { fromCol: 1, fromRow: 3 };
      expect(resolveConnectorEndpoints(cellRange)).toEqual(['B4', 'B4']);
    });

    it('toCol/toRowがundefinedでflipHの場合、同じセルが返ること', () => {
      const cellRange: CellRange = { fromCol: 1, fromRow: 3 };
      expect(resolveConnectorEndpoints(cellRange, true, false)).toEqual([
        'B4',
        'B4',
      ]);
    });
  });
});

describe('parseRelationships', () => {
  describe('正常系', () => {
    it('リレーションシップXMLからエントリが抽出されること', () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="../media/image1.png"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>
  <Relationship Id="rId2" Target="../media/image2.jpg"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>
</Relationships>`;

      const result = parseRelationships(relsXml);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        rId: 'rId1',
        target: '../media/image1.png',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      });
      expect(result[1]).toEqual({
        rId: 'rId2',
        target: '../media/image2.jpg',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      });
    });

    it('Type属性がない場合、typeが含まれないこと', () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="../media/image1.png"/>
</Relationships>`;

      const result = parseRelationships(relsXml);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        rId: 'rId1',
        target: '../media/image1.png',
      });
      expect(result[0].type).toBeUndefined();
    });

    it('Id属性がない要素がスキップされること', () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="../media/image1.png"/>
</Relationships>`;

      const result = parseRelationships(relsXml);
      expect(result).toHaveLength(0);
    });

    it('Target属性がない要素がスキップされること', () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"/>
</Relationships>`;

      const result = parseRelationships(relsXml);
      expect(result).toHaveLength(0);
    });

    it('空のリレーションシップXMLで空配列が返ること', () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

      const result = parseRelationships(relsXml);
      expect(result).toHaveLength(0);
    });
  });
});

describe('resolveRelativePath', () => {
  describe('正常系', () => {
    it('相対パス"../"が正しく解決されること', () => {
      expect(resolveRelativePath('xl/drawings', '../media/image1.png')).toBe(
        'xl/media/image1.png',
      );
    });

    it('同一ディレクトリの相対パスが正しく解決されること', () => {
      expect(resolveRelativePath('xl/drawings', 'file.xml')).toBe(
        'xl/drawings/file.xml',
      );
    });

    it('"."が正しくスキップされること', () => {
      expect(resolveRelativePath('xl/drawings', './file.xml')).toBe(
        'xl/drawings/file.xml',
      );
    });

    it('絶対パスの場合、先頭の"/"が除去されて返ること', () => {
      expect(resolveRelativePath('xl/drawings', '/media/image1.png')).toBe(
        'media/image1.png',
      );
    });

    it('複数階層の"../"が正しく解決されること', () => {
      expect(
        resolveRelativePath('xl/drawings/sub', '../../media/image1.png'),
      ).toBe('xl/media/image1.png');
    });

    it('baseDirが空の場合、相対パスのみが返ること', () => {
      expect(resolveRelativePath('', 'media/image1.png')).toBe(
        'media/image1.png',
      );
    });
  });
});

describe('resolveImagePaths', () => {
  describe('正常系', () => {
    it('画像パスが正しく解決されること', () => {
      const images = [{ rId: 'rId1' }, { rId: 'rId2' }];
      const relationships = [
        { rId: 'rId1', target: '../media/image1.png' },
        { rId: 'rId2', target: '../media/image2.jpg' },
      ];
      const result = resolveImagePaths(images, relationships, 'xl/drawings');
      expect(result.get('rId1')).toBe('xl/media/image1.png');
      expect(result.get('rId2')).toBe('xl/media/image2.jpg');
    });

    it('対応するリレーションシップがない場合、マッピングに含まれないこと', () => {
      const images = [{ rId: 'rId99' }];
      const relationships = [{ rId: 'rId1', target: '../media/image1.png' }];
      const result = resolveImagePaths(images, relationships, 'xl/drawings');
      expect(result.size).toBe(0);
    });

    it('空の画像配列で空のMapが返ること', () => {
      const result = resolveImagePaths(
        [],
        [{ rId: 'rId1', target: '../media/image1.png' }],
        'xl/drawings',
      );
      expect(result.size).toBe(0);
    });

    it('空のリレーションシップで空のMapが返ること', () => {
      const result = resolveImagePaths([{ rId: 'rId1' }], [], 'xl/drawings');
      expect(result.size).toBe(0);
    });
  });
});

// --- XlsxDrawingParser クラスのテスト ---

describe('XlsxDrawingParser', () => {
  let parser: XlsxDrawingParser;

  beforeEach(() => {
    parser = new XlsxDrawingParser();
  });

  describe('parseImages', () => {
    describe('正常系', () => {
      it('twoCellAnchor内のpicから画像情報が抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>5</xdr:row></xdr:from>
    <xdr:to><xdr:col>2</xdr:col><xdr:row>10</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          rId: 'rId1',
          rowIndex: 5,
          cellRange: { fromCol: 0, fromRow: 5, toCol: 2, toRow: 10 },
        });
      });

      it('oneCellAnchor内のpicから画像情報が抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>1</xdr:col><xdr:row>3</xdr:row></xdr:from>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill>
    </xdr:pic>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          rId: 'rId2',
          rowIndex: 3,
          cellRange: { fromCol: 1, fromRow: 3 },
        });
      });

      it('r:link属性の画像も抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:blipFill><a:blip r:link="rId3"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rId).toBe('rId3');
      });

      it('複数のアンカーから複数の画像が抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>3</xdr:col><xdr:row>10</xdr:row></xdr:from>
    <xdr:to><xdr:col>5</xdr:col><xdr:row>15</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(2);
        expect(result[0].rId).toBe('rId1');
        expect(result[1].rId).toBe('rId2');
      });
    });

    describe('異常系', () => {
      it('pic要素がないアンカーでは画像が抽出されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:txBody><a:p><a:r><a:t>テキスト</a:t></a:r></a:p></xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(0);
      });

      it('blip要素にr:embed/r:linkがない場合、画像が抽出されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:blipFill><a:blip/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(0);
      });

      it('空のDrawingXMLで空配列が返ること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(0);
      });

      it('from/to要素がないアンカーではcellRangeがundefinedになりrowIndexが0になること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].rowIndex).toBe(0);
        expect(result[0].cellRange).toBeUndefined();
      });

      it('from要素のcol/rowが非数値の場合、cellRangeがundefinedになること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>abc</xdr:col><xdr:row>xyz</xdr:row></xdr:from>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].cellRange).toBeUndefined();
      });

      it('from要素のcolのみ有効な場合、fromRowが0にデフォルトされること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>2</xdr:col><xdr:row>abc</xdr:row></xdr:from>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].cellRange).toEqual({ fromCol: 2, fromRow: 0 });
      });

      it('from要素のrowのみ有効な場合、fromColが0にデフォルトされること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>abc</xdr:col><xdr:row>3</xdr:row></xdr:from>
    <xdr:pic>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseImages(xml);
        expect(result).toHaveLength(1);
        expect(result[0].cellRange).toEqual({ fromCol: 0, fromRow: 3 });
      });
    });
  });

  describe('parseShapeTexts', () => {
    describe('正常系', () => {
      it('図形内テキストが抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>2</xdr:row></xdr:from>
    <xdr:to><xdr:col>3</xdr:col><xdr:row>5</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="4" name="Shape1"/></xdr:nvSpPr>
      <xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr>
      <xdr:txBody>
        <a:p><a:r><a:t>Hello</a:t></a:r></a:p>
        <a:p><a:r><a:t>World</a:t></a:r></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Hello\nWorld');
        expect(result[0].rowIndex).toBe(2);
        expect(result[0].drawingObjectId).toBe(4);
        expect(result[0].metadata).toEqual({
          presetGeometry: 'rect',
          cellRange: { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
        });
      });

      it('複数のrun要素が結合されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="5" name="Shape2"/></xdr:nvSpPr>
      <xdr:spPr><a:prstGeom prst="ellipse"/></xdr:spPr>
      <xdr:txBody>
        <a:p>
          <a:r><a:t>Part1</a:t></a:r>
          <a:r><a:t>Part2</a:t></a:r>
        </a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Part1Part2');
      });

      it('presetGeometryがない場合、metadataにpresetGeometryが含まれないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="6" name="Shape3"/></xdr:nvSpPr>
      <xdr:spPr></xdr:spPr>
      <xdr:txBody>
        <a:p><a:r><a:t>Text</a:t></a:r></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          cellRange: { fromCol: 0, fromRow: 0, toCol: 1, toRow: 1 },
        });
      });
    });

    describe('異常系', () => {
      it('txBodyがない図形は抽出されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="7" name="Shape4"/></xdr:nvSpPr>
      <xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(0);
      });

      it('テキストが空の図形は抽出されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="8" name="Shape5"/></xdr:nvSpPr>
      <xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr>
      <xdr:txBody>
        <a:p></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(0);
      });

      it('cNvPr要素がない場合、drawingObjectIdが設定されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:spPr><a:prstGeom prst="rect"/></xdr:spPr>
      <xdr:txBody>
        <a:p><a:r><a:t>NoId</a:t></a:r></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].drawingObjectId).toBeUndefined();
      });

      it('spPr要素がない場合、cellRangeのみのmetadataになること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="9" name="Shape6"/></xdr:nvSpPr>
      <xdr:txBody>
        <a:p><a:r><a:t>NoSpPr</a:t></a:r></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          cellRange: { fromCol: 0, fromRow: 0, toCol: 1, toRow: 1 },
        });
      });

      it('from/to要素がなくspPrもない場合、metadataが設定されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="10" name="Shape7"/></xdr:nvSpPr>
      <xdr:txBody>
        <a:p><a:r><a:t>Minimal</a:t></a:r></a:p>
      </xdr:txBody>
    </xdr:sp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseShapeTexts(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toBeUndefined();
      });
    });
  });

  describe('parseConnectors', () => {
    describe('正常系', () => {
      it('コネクタ情報が抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>3</xdr:col><xdr:row>3</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:nvCxnSpPr>
        <xdr:cNvCxnSpPr>
          <a:stCxn id="4" idx="2"/>
          <a:endCxn id="5" idx="0"/>
        </xdr:cNvCxnSpPr>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
        <a:ln>
          <a:headEnd type="none"/>
          <a:tailEnd type="triangle"/>
        </a:ln>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          rowIndex: 0,
          metadata: {
            presetGeometry: 'straightConnector1',
            cellRange: { fromCol: 0, fromRow: 0, toCol: 3, toRow: 3 },
          },
          startConnection: { drawingObjectId: 4, connectionSiteIndex: 2 },
          endConnection: { drawingObjectId: 5, connectionSiteIndex: 0 },
          headEndType: 'none',
          tailEndType: 'triangle',
        });
      });

      it('flipH/flipVが正しく抽出されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:spPr>
        <a:xfrm flipH="1" flipV="1"/>
        <a:prstGeom prst="bentConnector3"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].flipH).toBe(true);
        expect(result[0].flipV).toBe(true);
      });

      it('headEnd/tailEndのtype属性がない場合、"none"がデフォルトになること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:spPr>
        <a:prstGeom prst="line"/>
        <a:ln>
          <a:headEnd/>
          <a:tailEnd/>
        </a:ln>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].headEndType).toBe('none');
        expect(result[0].tailEndType).toBe('none');
      });

      it('接続情報のidx属性がない場合、connectionSiteIndexが0になること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:nvCxnSpPr>
        <xdr:cNvCxnSpPr>
          <a:stCxn id="10"/>
          <a:endCxn id="11"/>
        </xdr:cNvCxnSpPr>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection?.connectionSiteIndex).toBe(0);
        expect(result[0].endConnection?.connectionSiteIndex).toBe(0);
      });
    });

    describe('異常系', () => {
      it('spPr要素がない場合、cellRangeのみのmetadataが設定されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          cellRange: { fromCol: 0, fromRow: 0, toCol: 1, toRow: 1 },
        });
      });

      it('spPr要素がなくcellRangeもない場合、metadataが設定されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:cxnSp>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toBeUndefined();
      });

      it('prstGeomがなくcellRangeがある場合、cellRangeのみのmetadataが設定されること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>2</xdr:col><xdr:row>2</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:spPr>
        <a:ln/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
        });
      });

      it('stCxnのid属性が不正な場合、startConnectionが設定されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:nvCxnSpPr>
        <xdr:cNvCxnSpPr>
          <a:stCxn id="abc" idx="0"/>
          <a:endCxn id="xyz" idx="0"/>
        </xdr:cNvCxnSpPr>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('stCxn/endCxnのidx属性が不正な場合、connectionSiteIndexが0になること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:nvCxnSpPr>
        <xdr:cNvCxnSpPr>
          <a:stCxn id="4" idx="abc"/>
          <a:endCxn id="5" idx="xyz"/>
        </xdr:cNvCxnSpPr>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

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
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:nvCxnSpPr>
        <xdr:cNvCxnSpPr>
          <a:stCxn idx="0"/>
          <a:endCxn idx="0"/>
        </xdr:cNvCxnSpPr>
      </xdr:nvCxnSpPr>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('cNvCxnSpPr要素がない場合、接続情報が設定されないこと', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
    <xdr:to><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:to>
    <xdr:cxnSp>
      <xdr:spPr>
        <a:prstGeom prst="straightConnector1"/>
      </xdr:spPr>
    </xdr:cxnSp>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
        expect(result).toHaveLength(1);
        expect(result[0].startConnection).toBeUndefined();
        expect(result[0].endConnection).toBeUndefined();
      });

      it('空のDrawingXMLで空配列が返ること', () => {
        const xml = `
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">
</xdr:wsDr>`;

        const result = parser.parseConnectors(xml);
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
      });
    });
  });

  describe('resolveImagePaths', () => {
    describe('正常系', () => {
      it('ユーティリティ関数に委譲されること', () => {
        const images = [{ rId: 'rId1', rowIndex: 0 }];
        const relationships = [{ rId: 'rId1', target: '../media/image1.png' }];
        const result = parser.resolveImagePaths(
          images,
          relationships,
          'xl/drawings',
        );
        expect(result.get('rId1')).toBe('xl/media/image1.png');
      });
    });
  });

  describe('resolveRelativePath', () => {
    describe('正常系', () => {
      it('ユーティリティ関数に委譲されること', () => {
        const result = parser.resolveRelativePath(
          'xl/drawings',
          '../media/image1.png',
        );
        expect(result).toBe('xl/media/image1.png');
      });
    });
  });

  describe('バージョン互換性テスト', () => {
    it('名前空間プレフィックスなしのDrawing XMLで画像を抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <twoCellAnchor>
              <from><col>0</col><row>2</row></from>
              <to><col>4</col><row>8</row></to>
              <pic>
                <blipFill>
                  <a:blip r:embed="rId1"/>
                </blipFill>
              </pic>
            </twoCellAnchor>
          </wsDr>`;
      const images = parser.parseImages(xml);
      expect(images).toHaveLength(1);
      expect(images[0].rId).toBe('rId1');
    });

    it('absoluteAnchor内の画像を抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <xdr:absoluteAnchor>
              <xdr:pic>
                <xdr:blipFill>
                  <a:blip r:embed="rId5"/>
                </xdr:blipFill>
              </xdr:pic>
            </xdr:absoluteAnchor>
          </xdr:wsDr>`;
      const images = parser.parseImages(xml);
      expect(images).toHaveLength(1);
      expect(images[0].rId).toBe('rId5');
    });

    it('r:link属性の外部画像参照を抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <xdr:twoCellAnchor>
              <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
              <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
              <xdr:pic>
                <xdr:blipFill>
                  <a:blip r:link="rId10"/>
                </xdr:blipFill>
              </xdr:pic>
            </xdr:twoCellAnchor>
          </xdr:wsDr>`;
      const images = parser.parseImages(xml);
      expect(images).toHaveLength(1);
      expect(images[0].rId).toBe('rId10');
    });

    it('グループ図形内の画像を抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <xdr:twoCellAnchor>
              <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
              <xdr:to><xdr:col>10</xdr:col><xdr:row>10</xdr:row></xdr:to>
              <xdr:grpSp>
                <xdr:pic>
                  <xdr:blipFill>
                    <a:blip r:embed="rId7"/>
                  </xdr:blipFill>
                </xdr:pic>
              </xdr:grpSp>
            </xdr:twoCellAnchor>
          </xdr:wsDr>`;
      const images = parser.parseImages(xml);
      expect(images).toHaveLength(1);
      expect(images[0].rId).toBe('rId7');
    });

    it('txBody内にa:p要素がない図形はテキストなしとして処理される', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <xdr:twoCellAnchor>
              <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
              <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
              <xdr:sp>
                <xdr:nvSpPr><xdr:cNvPr id="2" name="Shape1"/></xdr:nvSpPr>
                <xdr:txBody></xdr:txBody>
              </xdr:sp>
            </xdr:twoCellAnchor>
          </xdr:wsDr>`;
      const shapes = parser.parseShapeTexts(xml);
      expect(shapes).toEqual([]);
    });

    it('a:fld要素内のテキストを抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <xdr:twoCellAnchor>
              <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
              <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
              <xdr:sp>
                <xdr:nvSpPr><xdr:cNvPr id="2" name="DateField"/></xdr:nvSpPr>
                <xdr:txBody>
                  <a:p>
                    <a:fld type="{DATE}">
                      <a:t>2024/01/01</a:t>
                    </a:fld>
                  </a:p>
                </xdr:txBody>
              </xdr:sp>
            </xdr:twoCellAnchor>
          </xdr:wsDr>`;
      const shapes = parser.parseShapeTexts(xml);
      expect(shapes).toHaveLength(1);
      expect(shapes[0].text).toBe('2024/01/01');
    });

    it('名前空間プレフィックス混在XMLから図形テキストを抽出する', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <twoCellAnchor>
              <from><col>0</col><row>0</row></from>
              <to><col>5</col><row>5</row></to>
              <sp>
                <nvSpPr><cNvPr id="2" name="Shape1"/></nvSpPr>
                <txBody>
                  <a:p><a:r><a:t>プレフィックスなし図形</a:t></a:r></a:p>
                </txBody>
              </sp>
            </twoCellAnchor>
          </wsDr>`;
      const shapes = parser.parseShapeTexts(xml);
      expect(shapes).toHaveLength(1);
      expect(shapes[0].text).toBe('プレフィックスなし図形');
    });
  });
});

describe('XlsxDrawingParser - mc:AlternateContent重複抽出防止', () => {
  const parser = new XlsxDrawingParser();

  it('mc:AlternateContent内の画像がmc:Choice側のみ抽出される（Fallbackが除去される）', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:from>
          <xdr:to><xdr:col>3</xdr:col><xdr:row>5</xdr:row></xdr:to>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <xdr:pic>
                <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
              </xdr:pic>
            </mc:Choice>
            <mc:Fallback>
              <xdr:pic>
                <xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill>
              </xdr:pic>
            </mc:Fallback>
          </mc:AlternateContent>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const images = parser.parseImages(xml);

    expect(images).toHaveLength(1);
    expect(images[0].rId).toBe('rId1');
  });

  it('mc:AlternateContent内の図形テキストが重複なく抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
          <xdr:to><xdr:col>2</xdr:col><xdr:row>2</xdr:row></xdr:to>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <xdr:sp>
                <xdr:nvSpPr><xdr:cNvPr id="5" name="Shape1"/></xdr:nvSpPr>
                <xdr:txBody><a:p><a:r><a:t>新形式テキスト</a:t></a:r></a:p></xdr:txBody>
              </xdr:sp>
            </mc:Choice>
            <mc:Fallback>
              <xdr:sp>
                <xdr:nvSpPr><xdr:cNvPr id="5" name="Shape1"/></xdr:nvSpPr>
                <xdr:txBody><a:p><a:r><a:t>旧形式テキスト</a:t></a:r></a:p></xdr:txBody>
              </xdr:sp>
            </mc:Fallback>
          </mc:AlternateContent>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const shapes = parser.parseShapeTexts(xml);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('新形式テキスト');
  });

  it('mc:AlternateContent内のコネクタが重複なく抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
          <xdr:to><xdr:col>3</xdr:col><xdr:row>3</xdr:row></xdr:to>
          <mc:AlternateContent>
            <mc:Choice Requires="a14">
              <xdr:cxnSp>
                <xdr:spPr><a:prstGeom prst="straightConnector1"/></xdr:spPr>
              </xdr:cxnSp>
            </mc:Choice>
            <mc:Fallback>
              <xdr:cxnSp>
                <xdr:spPr><a:prstGeom prst="line"/></xdr:spPr>
              </xdr:cxnSp>
            </mc:Fallback>
          </mc:AlternateContent>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const connectors = parser.parseConnectors(xml);

    expect(connectors).toHaveLength(1);
    expect(connectors[0].metadata?.presetGeometry).toBe('straightConnector1');
  });
});

describe('XlsxDrawingParser - absoluteAnchor対応', () => {
  const parser = new XlsxDrawingParser();

  it('absoluteAnchor内の画像を抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <xdr:absoluteAnchor>
          <xdr:pic>
            <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
          </xdr:pic>
        </xdr:absoluteAnchor>
      </xdr:wsDr>`;

    const images = parser.parseImages(xml);

    expect(images).toHaveLength(1);
    expect(images[0].rId).toBe('rId1');
    expect(images[0].rowIndex).toBe(0);
    expect(images[0].cellRange).toBeUndefined();
  });

  it('absoluteAnchor内の図形テキストを抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <xdr:absoluteAnchor>
          <xdr:sp>
            <xdr:nvSpPr><xdr:cNvPr id="10" name="AbsShape"/></xdr:nvSpPr>
            <xdr:txBody><a:p><a:r><a:t>絶対アンカーテキスト</a:t></a:r></a:p></xdr:txBody>
          </xdr:sp>
        </xdr:absoluteAnchor>
      </xdr:wsDr>`;

    const shapes = parser.parseShapeTexts(xml);

    expect(shapes).toHaveLength(1);
    expect(shapes[0].text).toBe('絶対アンカーテキスト');
    expect(shapes[0].rowIndex).toBe(0);
  });

  it('absoluteAnchor内のコネクタを抽出する', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <xdr:absoluteAnchor>
          <xdr:cxnSp>
            <xdr:spPr><a:prstGeom prst="straightConnector1"/></xdr:spPr>
          </xdr:cxnSp>
        </xdr:absoluteAnchor>
      </xdr:wsDr>`;

    const connectors = parser.parseConnectors(xml);

    expect(connectors).toHaveLength(1);
    expect(connectors[0].metadata?.presetGeometry).toBe('straightConnector1');
    expect(connectors[0].rowIndex).toBe(0);
  });
});

describe('XlsxDrawingParser - グループ図形の再帰探索', () => {
  const parser = new XlsxDrawingParser();

  it('grpSp内の画像が再帰的に抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
          <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
          <xdr:grpSp>
            <xdr:pic>
              <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
            </xdr:pic>
            <xdr:grpSp>
              <xdr:pic>
                <xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill>
              </xdr:pic>
            </xdr:grpSp>
          </xdr:grpSp>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const images = parser.parseImages(xml);

    expect(images).toHaveLength(2);
    expect(images[0].rId).toBe('rId1');
    expect(images[1].rId).toBe('rId2');
  });

  it('grpSp内の図形テキストが再帰的に抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
          <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
          <xdr:grpSp>
            <xdr:sp>
              <xdr:nvSpPr><xdr:cNvPr id="2" name="Shape1"/></xdr:nvSpPr>
              <xdr:txBody><a:p><a:r><a:t>グループ内図形1</a:t></a:r></a:p></xdr:txBody>
            </xdr:sp>
            <xdr:grpSp>
              <xdr:sp>
                <xdr:nvSpPr><xdr:cNvPr id="3" name="Shape2"/></xdr:nvSpPr>
                <xdr:txBody><a:p><a:r><a:t>ネスト内図形2</a:t></a:r></a:p></xdr:txBody>
              </xdr:sp>
            </xdr:grpSp>
          </xdr:grpSp>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const shapes = parser.parseShapeTexts(xml);

    expect(shapes).toHaveLength(2);
    expect(shapes[0].text).toBe('グループ内図形1');
    expect(shapes[1].text).toBe('ネスト内図形2');
  });

  it('grpSp内のコネクタが再帰的に抽出される', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from>
          <xdr:to><xdr:col>5</xdr:col><xdr:row>5</xdr:row></xdr:to>
          <xdr:grpSp>
            <xdr:cxnSp>
              <xdr:spPr><a:prstGeom prst="straightConnector1"/></xdr:spPr>
            </xdr:cxnSp>
          </xdr:grpSp>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;

    const connectors = parser.parseConnectors(xml);

    expect(connectors).toHaveLength(1);
    expect(connectors[0].metadata?.presetGeometry).toBe('straightConnector1');
  });
});
