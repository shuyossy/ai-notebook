import { escapeCsvCell, splitCsvIntoLogicalRows } from '@/main/lib/textExtractor/csvUtils';

describe('csvUtils', () => {
  describe('escapeCsvCell', () => {
    it('通常テキストはそのまま返す', () => {
      expect(escapeCsvCell('hello')).toBe('hello');
    });

    it('空文字列はそのまま返す', () => {
      expect(escapeCsvCell('')).toBe('');
    });

    it('カンマを含む場合はダブルクォートで囲む', () => {
      expect(escapeCsvCell('a,b')).toBe('"a,b"');
    });

    it('ダブルクォートを含む場合はエスケープして囲む', () => {
      expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    });

    it('改行を含む場合はダブルクォートで囲んで改行を保持する', () => {
      expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    });

    it('改行とカンマの両方を含む場合', () => {
      expect(escapeCsvCell('a,b\nc')).toBe('"a,b\nc"');
    });

    it('\\r\\nを含む場合はダブルクォートで囲む', () => {
      expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('\\rのみを含む場合はダブルクォートで囲む', () => {
      expect(escapeCsvCell('line1\rline2')).toBe('"line1\rline2"');
    });
  });

  describe('splitCsvIntoLogicalRows', () => {
    it('単純な複数行CSVを正しく分割する', () => {
      const csv = 'a,b,c\nd,e,f\ng,h,i';
      expect(splitCsvIntoLogicalRows(csv)).toEqual(['a,b,c', 'd,e,f', 'g,h,i']);
    });

    it('クォートフィールド内の改行は分割しない', () => {
      const csv = 'a,"b1\nb2",c\nd,e,f';
      expect(splitCsvIntoLogicalRows(csv)).toEqual(['a,"b1\nb2",c', 'd,e,f']);
    });

    it('エスケープされたダブルクォートを正しく処理する', () => {
      const csv = 'a,"say ""hi""",c\nd,e,f';
      expect(splitCsvIntoLogicalRows(csv)).toEqual([
        'a,"say ""hi""",c',
        'd,e,f',
      ]);
    });

    it('複数行クォートフィールド後に通常行が続く場合', () => {
      const csv = '"line1\nline2\nline3",b\nc,d';
      expect(splitCsvIntoLogicalRows(csv)).toEqual([
        '"line1\nline2\nline3",b',
        'c,d',
      ]);
    });

    it('空のCSV文字列', () => {
      expect(splitCsvIntoLogicalRows('')).toEqual([]);
    });

    it('末尾改行ありの場合は最後の空行を追加しない', () => {
      const csv = 'a,b\nc,d\n';
      expect(splitCsvIntoLogicalRows(csv)).toEqual(['a,b', 'c,d']);
    });

    it('\\r\\n改行を正しく処理する', () => {
      const csv = 'a,b\r\nc,d\r\ne,f';
      expect(splitCsvIntoLogicalRows(csv)).toEqual(['a,b', 'c,d', 'e,f']);
    });

    it('同一行に複数のクォートフィールドがある場合', () => {
      const csv = '"a1\na2","b1\nb2"\nc,d';
      expect(splitCsvIntoLogicalRows(csv)).toEqual([
        '"a1\na2","b1\nb2"',
        'c,d',
      ]);
    });

    it('クォートフィールド内の\\r\\nは分割しない', () => {
      const csv = '"a\r\nb",c\nd,e';
      expect(splitCsvIntoLogicalRows(csv)).toEqual(['"a\r\nb",c', 'd,e']);
    });
  });
});
