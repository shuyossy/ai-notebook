/**
 * normalizeExtractedText のテスト
 * @jest-environment node
 */

// Electron モックを最初に適用
jest.mock(
  'electron',
  () => require('../../test-utils/mockElectron').mockElectron,
);
jest.mock(
  'electron-store',
  () => require('../../test-utils/mockElectron').default,
);
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return { getCustomAppDataDir: jest.fn(() => testAppData) };
});

import {
  normalizeExtractedText,
  TextPostProcessPolicy,
} from '@/main/lib/textExtractor/extractionUtils';

describe('normalizeExtractedText', () => {
  describe('正常系 - デフォルトポリシー', () => {
    it('改行コードがLFに正規化されること', () => {
      const input = 'line1\r\nline2\rline3\nline4';
      const result = normalizeExtractedText(input);
      expect(result).not.toContain('\r');
      expect(result.split('\n').length).toBe(4);
    });

    it('制御文字が除去されること', () => {
      const input = 'abc\u0000\u0001\u0007def\u001Fghi';
      const result = normalizeExtractedText(input);
      expect(result).toBe('abcdefghi');
    });

    it('行末の空白が削除されること', () => {
      const input = 'hello   \nworld\t\t';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello\nworld');
    });

    it('連続空白が1つに圧縮されること（行頭インデント保持）', () => {
      const input = '  hello    world';
      const result = normalizeExtractedText(input);
      // 行頭のインデント（2スペース）は保持し、中間の連続空白は1つに圧縮
      expect(result).toBe('  hello world');
    });

    it('カンマのみの行が削除されること', () => {
      const input = 'line1\n,,,\nline2\n , , ,\nline3';
      const result = normalizeExtractedText(input);
      expect(result).toBe('line1\n\nline2\n\nline3');
    });

    it('行末カンマが削除されること', () => {
      const input = 'hello,,\nworld,';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello\nworld');
    });

    it('空白のみの行が空行に変換されること', () => {
      const input = 'line1\n   \nline2';
      const result = normalizeExtractedText(input);
      expect(result).toBe('line1\n\nline2');
    });

    it('連続空行が最大2行に制限されること', () => {
      const input = 'line1\n\n\n\n\nline2';
      const result = normalizeExtractedText(input);
      // maxConsecutiveBlankLines: 2 → 最大2つの空行を許容
      expect(result).toBe('line1\n\n\nline2');
    });

    it('通常のテキストがそのまま保持されること', () => {
      const input = 'これは正常なテキストです。\n改行も含まれます。';
      const result = normalizeExtractedText(input);
      expect(result).toBe('これは正常なテキストです。\n改行も含まれます。');
    });
  });

  describe('正常系 - collapsePreserveIndent: false', () => {
    it('行頭インデントも含めて連続空白が圧縮されること', () => {
      const input = '    hello    world';
      const result = normalizeExtractedText(input, {
        collapsePreserveIndent: false,
      });
      expect(result).toBe(' hello world');
    });
  });

  describe('正常系 - collapseConsecutiveWhitespaces: false', () => {
    it('連続空白が圧縮されないこと', () => {
      const input = 'hello    world';
      const result = normalizeExtractedText(input, {
        collapseConsecutiveWhitespaces: false,
      });
      expect(result).toBe('hello    world');
    });
  });

  describe('正常系 - trimLineEndSpaces: false', () => {
    it('行末空白が保持されること', () => {
      const input = 'hello   ';
      const result = normalizeExtractedText(input, {
        trimLineEndSpaces: false,
      });
      // 行末空白が保持（ただし連続空白圧縮は適用される）
      expect(result).toBe('hello ');
    });
  });

  describe('正常系 - removeCommaOnlyLines: false', () => {
    it('カンマのみの行が保持されること', () => {
      const input = 'line1\n,,,\nline2';
      const result = normalizeExtractedText(input, {
        removeCommaOnlyLines: false,
        removeTrailingCommas: false,
      });
      expect(result).toBe('line1\n,,,\nline2');
    });
  });

  describe('正常系 - removeTrailingCommas: false', () => {
    it('行末カンマが保持されること', () => {
      const input = 'hello,,,';
      const result = normalizeExtractedText(input, {
        removeTrailingCommas: false,
      });
      expect(result).toBe('hello,,,');
    });
  });

  describe('正常系 - preserveCsvTrailingEmptyFields: true', () => {
    it('CSV行の行末カンマが温存されること（内部カンマあり）', () => {
      const input = 'a,b,c,';
      const result = normalizeExtractedText(input, {
        preserveCsvTrailingEmptyFields: true,
      });
      // 内部カンマがあるため温存される
      expect(result).toBe('a,b,c,');
    });

    it('クォートを含む行の行末カンマが温存されること', () => {
      const input = '"hello",';
      const result = normalizeExtractedText(input, {
        preserveCsvTrailingEmptyFields: true,
      });
      expect(result).toBe('"hello",');
    });

    it('#sheet:ヘッダ行の行末カンマが温存されること', () => {
      const input = '#sheet:Sheet1,';
      const result = normalizeExtractedText(input, {
        preserveCsvTrailingEmptyFields: true,
      });
      expect(result).toBe('#sheet:Sheet1,');
    });

    it('単純な単語の行末カンマは削除されること', () => {
      const input = 'hello,';
      const result = normalizeExtractedText(input, {
        preserveCsvTrailingEmptyFields: true,
      });
      // 内部カンマなし、クォートなし → 削除される
      expect(result).toBe('hello');
    });
  });

  describe('正常系 - maxConsecutiveBlankLines', () => {
    it('maxConsecutiveBlankLines: 0 で空行が全て削除されること', () => {
      const input = 'line1\n\n\nline2';
      const result = normalizeExtractedText(input, {
        maxConsecutiveBlankLines: 0,
      });
      expect(result).toBe('line1\nline2');
    });

    it('maxConsecutiveBlankLines: 1 で連続空行が1行に制限されること', () => {
      const input = 'line1\n\n\n\nline2';
      const result = normalizeExtractedText(input, {
        maxConsecutiveBlankLines: 1,
      });
      expect(result).toBe('line1\n\nline2');
    });

    it('maxConsecutiveBlankLines: -1 で空行制限が無効になること', () => {
      const input = 'line1\n\n\n\nline2';
      const result = normalizeExtractedText(input, {
        maxConsecutiveBlankLines: -1,
      });
      expect(result).toBe('line1\n\n\n\nline2');
    });
  });

  describe('正常系 - ポリシー組み合わせ', () => {
    it('CSV用ポリシー（preserveCsvTrailingEmptyFields + collapsePreserveIndent）が正しく動作すること', () => {
      const input = '  a,b,c,\n  d,e,,\nsingle,';
      const result = normalizeExtractedText(input, {
        preserveCsvTrailingEmptyFields: true,
        collapsePreserveIndent: true,
      });
      // 内部カンマありの行は行末カンマ温存、単一カンマの行は削除
      expect(result).toBe('  a,b,c,\n  d,e,,\nsingle');
    });

    it('全ポリシー無効化で最低限の正規化のみ行われること', () => {
      const allDisabled: Partial<TextPostProcessPolicy> = {
        collapseConsecutiveWhitespaces: false,
        collapsePreserveIndent: false,
        trimLineEndSpaces: false,
        removeTrailingCommas: false,
        preserveCsvTrailingEmptyFields: false,
        maxConsecutiveBlankLines: -1,
        removeCommaOnlyLines: false,
      };
      const input = 'hello   world,,,\r\n  \n\n\nline2';
      const result = normalizeExtractedText(input, allDisabled);
      // 改行正規化、制御文字除去、空白のみ行→空行変換（常時適用）が行われる
      expect(result).toBe('hello   world,,,\n\n\n\nline2');
    });
  });

  describe('正常系 - 特殊文字', () => {
    it('全角スペースが連続空白として圧縮されること', () => {
      const input = 'hello\u3000\u3000world';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello world');
    });

    it('NBSP（ノーブレークスペース）が連続空白として圧縮されること', () => {
      const input = 'hello\u00A0\u00A0world';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello world');
    });

    it('タブ文字が連続空白として圧縮されること', () => {
      const input = 'hello\t\tworld';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello world');
    });

    it('タブ・全角スペース・半角スペースの混在が1つに圧縮されること', () => {
      const input = 'hello \t\u3000 world';
      const result = normalizeExtractedText(input);
      expect(result).toBe('hello world');
    });
  });

  describe('異常系 - エッジケース', () => {
    it('空文字列が入力された場合、空文字列が返ること', () => {
      const result = normalizeExtractedText('');
      expect(result).toBe('');
    });

    it('制御文字のみの入力で空文字列が返ること', () => {
      const result = normalizeExtractedText('\u0000\u0001\u0007');
      expect(result).toBe('');
    });

    it('空白のみの入力で空文字列が返ること', () => {
      const result = normalizeExtractedText('   \t\t   ');
      expect(result).toBe('');
    });

    it('改行のみの入力が空行制限で圧縮されること', () => {
      const result = normalizeExtractedText('\n\n\n\n\n');
      // maxConsecutiveBlankLines: 2 なので最大2行の空行
      expect(result).toBe('\n');
    });
  });

  describe('正常系 - overridesパラメータ', () => {
    it('overridesがundefinedの場合、デフォルトポリシーが適用されること', () => {
      const input = 'hello    world   ';
      const result = normalizeExtractedText(input, undefined);
      expect(result).toBe('hello world');
    });

    it('部分的なoverridesが正しくマージされること', () => {
      const input = 'hello    world';
      const result = normalizeExtractedText(input, {
        collapseConsecutiveWhitespaces: false,
      });
      // 連続空白圧縮が無効化されるが、他のポリシーはデフォルト適用
      expect(result).toBe('hello    world');
    });
  });
});
