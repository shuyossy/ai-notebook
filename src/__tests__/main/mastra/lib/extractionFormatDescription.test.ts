import {
  getFormatDescription,
  buildDocumentFormatContext,
} from '@/mastra/lib/extractionFormatDescription';
import type { TextExtractionFormatType } from '@/types/review';

describe('extractionFormatDescription', () => {
  describe('getFormatDescription', () => {
    const allFormatTypes: TextExtractionFormatType[] = [
      'txt-plain',
      'csv-plain',
      'md-plain',
      'xlsx-csv-v1',
      'xlsx-rich-v1',
      'docx-plain',
      'docx-rich-v1',
      'pptx-plain',
      'pptx-rich-v1',
      'pdf-text-v1',
      'pdf-rich-v1',
      'image-pages',
    ];

    it.each(allFormatTypes)(
      "フォーマット識別子 '%s' に対して空でない説明を返す",
      (formatType) => {
        const description = getFormatDescription(formatType);
        expect(description).toBeTruthy();
        expect(description.length).toBeGreaterThan(0);
      },
    );

    it('xlsx-rich-v1の説明にシート区切り・行マーカー・画像リンク・図形タグ・コネクタ・RFC 4180の記載がある（includeImages=true）', () => {
      const description = getFormatDescription('xlsx-rich-v1', true);
      expect(description).toContain('#sheet:');
      expect(description).toContain('[rN]');
      expect(description).toContain('![image');
      expect(description).toContain('sN');
      expect(description).toContain('cN');
      expect(description).toContain('@');
      expect(description).toContain('RFC 4180');
      // Excelにはp:/sz:がないことを確認
      expect(description).not.toContain('p:');
      expect(description).not.toContain('EMU');
    });

    it('docx-rich-v1の説明にMarkdownヘッダ・画像リンク・CSV表・RFC 4180の記載がある（includeImages=true）', () => {
      const description = getFormatDescription('docx-rich-v1', true);
      expect(description).toContain('#');
      expect(description).toContain('![image]');
      expect(description).toContain('CSV');
      expect(description).toContain('RFC 4180');
    });

    it('pdf-rich-v1の説明にページ区切り・画像リンクの記載がある（includeImages=true）', () => {
      const description = getFormatDescription('pdf-rich-v1', true);
      expect(description).toContain('#page:');
      expect(description).toContain('![image]');
      expect(description).toContain('referenceId');
    });

    it('pptx-rich-v1の説明にスライド区切り・図形タグ・CSV表・画像リンク・コネクタ・座標・RFC 4180の記載がある（includeImages=true）', () => {
      const description = getFormatDescription('pptx-rich-v1', true);
      expect(description).toContain('#slide:');
      expect(description).toContain('sN');
      expect(description).toContain('p:');
      expect(description).toContain('CSV');
      expect(description).toContain('![image]');
      expect(description).toContain('cN');
      expect(description).not.toContain('EMU');
      expect(description).toContain('RFC 4180');
    });

    describe('includeImages=falseの場合、リッチフォーマットの説明に画像関連の記載が含まれない', () => {
      const richFormatsWithImageLines: TextExtractionFormatType[] = [
        'xlsx-rich-v1',
        'docx-rich-v1',
        'pptx-rich-v1',
        'pdf-rich-v1',
      ];

      it.each(richFormatsWithImageLines)(
        '%s: includeImages=falseで画像リンク・referenceIdの記載がない',
        (formatType) => {
          const description = getFormatDescription(formatType, false);
          expect(description).not.toContain('![image');
          expect(description).not.toContain('referenceId');
        },
      );

      it.each(richFormatsWithImageLines)(
        '%s: includeImages=trueで画像リンク・referenceIdの記載がある',
        (formatType) => {
          const description = getFormatDescription(formatType, true);
          expect(description).toContain('![image');
          expect(description).toContain('referenceId');
        },
      );
    });

    it('includeImagesのデフォルト値はfalse（画像関連の記載が含まれない）', () => {
      const descDefault = getFormatDescription('xlsx-rich-v1');
      const descExplicitFalse = getFormatDescription('xlsx-rich-v1', false);
      expect(descDefault).toBe(descExplicitFalse);
    });

    it('includeImages=falseでも画像以外のリッチフォーマット情報は保持される', () => {
      const xlsxDesc = getFormatDescription('xlsx-rich-v1', false);
      expect(xlsxDesc).toContain('#sheet:');
      expect(xlsxDesc).toContain('[rN]');
      expect(xlsxDesc).toContain('sN');
      expect(xlsxDesc).toContain('cN');

      const pptxDesc = getFormatDescription('pptx-rich-v1', false);
      expect(pptxDesc).toContain('#slide:');
      expect(pptxDesc).toContain('sN');
      expect(pptxDesc).toContain('cN');
      expect(pptxDesc).not.toContain('EMU');

      const docxDesc = getFormatDescription('docx-rich-v1', false);
      expect(docxDesc).toContain('Markdown');
      expect(docxDesc).toContain('CSV');

      const pdfDesc = getFormatDescription('pdf-rich-v1', false);
      expect(pdfDesc).toContain('#page:');
    });
  });

  describe('buildDocumentFormatContext', () => {
    it('ファイルが空配列の場合は空文字列を返す', () => {
      const result = buildDocumentFormatContext([]);
      expect(result).toBe('');
    });

    it('formatTypeが未設定のファイルのみの場合（テキストモード）は空文字列を返す', () => {
      const result = buildDocumentFormatContext([
        { name: 'doc.txt', processMode: 'text' },
      ]);
      expect(result).toBe('');
    });

    it('単一フォーマットのファイルに対して正しいコンテキストを生成する', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('DOCUMENT FORMAT INFORMATION:');
      expect(result).toContain('report.xlsx');
      expect(result).toContain('#sheet:');
      expect(result).toContain('FORMAT NON-DISCLOSURE');
    });

    it('同じフォーマットの複数ファイルがグループ化される', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report1.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
        {
          name: 'report2.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('report1.xlsx, report2.xlsx');
    });

    it('異なるフォーマットが別々に記載される', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
        {
          name: 'manual.docx',
          formatType: 'docx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('report.xlsx');
      expect(result).toContain('manual.docx');
      expect(result).toContain('#sheet:');
      expect(result).toContain('Markdown');
    });

    it('画像モードのファイルがimage-pagesとして処理される', () => {
      const result = buildDocumentFormatContext([
        { name: 'scan.pdf', processMode: 'image' },
      ]);
      expect(result).toContain('scan.pdf');
      expect(result).toContain('converted to images');
    });

    it('フォーマット非開示指示が含まれる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('FORMAT NON-DISCLOSURE');
      expect(result).toContain(
        'MUST NOT reference, mention, or describe any of these conventions',
      );
      // 全ての内部フォーマット用語が非開示リストに含まれている
      expect(result).toContain('"#sheet:"');
      expect(result).toContain('"#slide:"');
      expect(result).toContain('"#page:"');
      expect(result).toContain('"[rN]"');
    });

    it('テキストモードでformatType未設定のファイルはスキップされる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
        { name: 'unknown.dat', processMode: 'text' },
      ]);
      expect(result).toContain('report.xlsx');
      expect(result).not.toContain('unknown.dat');
    });

    it('画像モードかつformatType設定時はformatTypeが優先される', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'image',
        },
      ]);
      // formatTypeが設定されているのでimage-pagesではなくxlsx-rich-v1の説明が使われる
      expect(result).toContain('report.xlsx');
      expect(result).toContain('#sheet:');
      expect(result).not.toContain('converted to images');
    });

    it('画像モードファイルのformatTypeあり/なし混在時にそれぞれ正しく処理される', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'with-format.pdf',
          formatType: 'pdf-text-v1',
          processMode: 'image',
        },
        { name: 'no-format.pdf', processMode: 'image' },
      ]);
      // formatType設定済みファイルはそのformatTypeで処理
      expect(result).toContain('with-format.pdf');
      expect(result).toContain('PDF document content extracted as text');
      // formatType未設定の画像モードファイルはimage-pagesとして処理
      expect(result).toContain('no-format.pdf');
      expect(result).toContain('converted to images');
    });

    it('非開示指示に拡充された禁止用語が含まれている', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('"sN"');
      expect(result).toContain('"cN"');
      expect(result).toContain('"p:"');
      expect(result).toContain('"sz:"');
      expect(result).toContain('"@"');
      expect(result).toContain('"![image"');
    });

    it('プレーンフォーマットのみの場合は空文字列を返す', () => {
      const result = buildDocumentFormatContext([
        { name: 'doc.txt', formatType: 'txt-plain', processMode: 'text' },
        { name: 'memo.docx', formatType: 'docx-plain', processMode: 'text' },
        {
          name: 'slides.pptx',
          formatType: 'pptx-plain',
          processMode: 'text',
        },
        { name: 'paper.pdf', formatType: 'pdf-text-v1', processMode: 'text' },
      ]);
      expect(result).toBe('');
    });

    it('リッチ+プレーン混在の場合にフォーマットコンテキストが返り、両方のファイル情報が含まれる', () => {
      const result = buildDocumentFormatContext([
        { name: 'doc.txt', formatType: 'txt-plain', processMode: 'text' },
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      expect(result).toContain('DOCUMENT FORMAT INFORMATION:');
      expect(result).toContain('doc.txt');
      expect(result).toContain('report.xlsx');
      expect(result).toContain('#sheet:');
      expect(result).toContain('FORMAT NON-DISCLOSURE');
    });

    it('同じフォーマットでincludeImagesが異なるファイルは同グループになり、画像ありverの説明が使われる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report1.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: true,
        },
        {
          name: 'report2.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: false,
        },
      ]);
      // 同グループとして表示される
      expect(result).toContain('report1.xlsx, report2.xlsx');
      // 1つでもincludeImages=trueがあるので画像ありverの説明が使われる
      const nonDisclosureIndex = result.indexOf('FORMAT NON-DISCLOSURE');
      const formatDescriptionPart = result.slice(0, nonDisclosureIndex);
      expect(formatDescriptionPart).toContain('![image');
      expect(formatDescriptionPart).toContain('referenceId');
    });

    it('同じフォーマットかつ同じincludeImagesのファイルは同グループになる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report1.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: true,
        },
        {
          name: 'report2.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: true,
        },
      ]);
      expect(result).toContain('report1.xlsx, report2.xlsx');
    });

    it('includeImages=trueのグループには画像関連の説明が含まれる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'with-images.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: true,
        },
      ]);
      expect(result).toContain('![image');
      expect(result).toContain('referenceId');
    });

    it('includeImages=falseのグループにはフォーマット説明部分に画像関連の記載が含まれない', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'no-images.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: false,
        },
      ]);
      expect(result).toContain('no-images.xlsx');
      expect(result).toContain('#sheet:');
      // フォーマット説明部分（非開示指示より前）に画像リンクの記述がないことを確認
      const nonDisclosureIndex = result.indexOf('FORMAT NON-DISCLOSURE');
      const formatDescriptionPart = result.slice(0, nonDisclosureIndex);
      expect(formatDescriptionPart).not.toContain('![image');
      expect(formatDescriptionPart).not.toContain('referenceId');
    });

    it('includeImages未指定の場合はfalseとして扱う', () => {
      const resultUndefined = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
        },
      ]);
      const resultExplicitFalse = buildDocumentFormatContext([
        {
          name: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: false,
        },
      ]);
      expect(resultUndefined).toBe(resultExplicitFalse);
    });

    it('同じフォーマットの全ファイルがincludeImages=falseの場合は画像なしverの説明が使われる', () => {
      const result = buildDocumentFormatContext([
        {
          name: 'report1.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: false,
        },
        {
          name: 'report2.xlsx',
          formatType: 'xlsx-rich-v1',
          processMode: 'text',
          includeImages: false,
        },
      ]);
      // 同グループとして表示される
      expect(result).toContain('report1.xlsx, report2.xlsx');
      // 全ファイルがincludeImages=falseなので画像なしverの説明が使われる
      const nonDisclosureIndex = result.indexOf('FORMAT NON-DISCLOSURE');
      const formatDescriptionPart = result.slice(0, nonDisclosureIndex);
      expect(formatDescriptionPart).not.toContain('![image');
      expect(formatDescriptionPart).not.toContain('referenceId');
    });
  });

  describe('getFormatDescription - 網羅性', () => {
    const allFormatTypes: TextExtractionFormatType[] = [
      'txt-plain',
      'csv-plain',
      'md-plain',
      'xlsx-csv-v1',
      'xlsx-rich-v1',
      'docx-plain',
      'docx-rich-v1',
      'pptx-plain',
      'pptx-rich-v1',
      'pdf-text-v1',
      'pdf-rich-v1',
      'image-pages',
    ];

    it.each(allFormatTypes)(
      "フォーマット識別子 '%s' が汎用説明ではなく固有の説明を持つ",
      (formatType) => {
        const description = getFormatDescription(formatType);
        // 網羅性チェックのフォールバック文言が含まれていないことを確認
        expect(description).not.toContain('Document content in text format.');
      },
    );
  });
});
