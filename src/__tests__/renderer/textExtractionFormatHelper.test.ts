import {
  isRichFormatType,
  isPlainOnlyFormatType,
  hasRichStrategyAvailable,
} from '@/renderer/lib/textExtractionFormatHelper';

describe('textExtractionFormatHelper', () => {
  describe('isRichFormatType', () => {
    it('リッチフォーマット（-rich-v1で終わる）の場合trueを返す', () => {
      expect(isRichFormatType('xlsx-rich-v1')).toBe(true);
      expect(isRichFormatType('docx-rich-v1')).toBe(true);
      expect(isRichFormatType('pptx-rich-v1')).toBe(true);
      expect(isRichFormatType('pdf-rich-v1')).toBe(true);
    });

    it('リッチフォーマットでない場合falseを返す', () => {
      expect(isRichFormatType('txt-plain')).toBe(false);
      expect(isRichFormatType('csv-plain')).toBe(false);
      expect(isRichFormatType('xlsx-csv-v1')).toBe(false);
      expect(isRichFormatType('docx-plain')).toBe(false);
      expect(isRichFormatType('pptx-plain')).toBe(false);
      expect(isRichFormatType('pdf-text-v1')).toBe(false);
      expect(isRichFormatType('image-pages')).toBe(false);
    });

    it('nullの場合falseを返す', () => {
      expect(isRichFormatType(null)).toBe(false);
    });
  });

  describe('isPlainOnlyFormatType', () => {
    it('txt-plainの場合trueを返す', () => {
      expect(isPlainOnlyFormatType('txt-plain')).toBe(true);
    });

    it('csv-plainの場合trueを返す', () => {
      expect(isPlainOnlyFormatType('csv-plain')).toBe(true);
    });

    it('md-plainの場合trueを返す', () => {
      expect(isPlainOnlyFormatType('md-plain')).toBe(true);
    });

    it('その他のフォーマットの場合falseを返す', () => {
      expect(isPlainOnlyFormatType('xlsx-rich-v1')).toBe(false);
      expect(isPlainOnlyFormatType('docx-plain')).toBe(false);
      expect(isPlainOnlyFormatType('pdf-text-v1')).toBe(false);
      expect(isPlainOnlyFormatType('image-pages')).toBe(false);
    });

    it('nullの場合falseを返す', () => {
      expect(isPlainOnlyFormatType(null)).toBe(false);
    });
  });

  describe('hasRichStrategyAvailable', () => {
    it('xlsx, docx, pptx, pdfファイルの場合trueを返す', () => {
      expect(hasRichStrategyAvailable('report.xlsx')).toBe(true);
      expect(hasRichStrategyAvailable('document.docx')).toBe(true);
      expect(hasRichStrategyAvailable('presentation.pptx')).toBe(true);
      expect(hasRichStrategyAvailable('report.pdf')).toBe(true);
    });

    it('大文字拡張子でもtrueを返す', () => {
      expect(hasRichStrategyAvailable('REPORT.XLSX')).toBe(true);
      expect(hasRichStrategyAvailable('DOC.PDF')).toBe(true);
    });

    it('txt, csvなどリッチ戦略対象外のファイルの場合falseを返す', () => {
      expect(hasRichStrategyAvailable('readme.txt')).toBe(false);
      expect(hasRichStrategyAvailable('data.csv')).toBe(false);
      expect(hasRichStrategyAvailable('image.png')).toBe(false);
      expect(hasRichStrategyAvailable('noext')).toBe(false);
    });
  });
});
