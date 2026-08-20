/**
 * TextExtractorStrategyFactory のテスト
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

import { TextExtractorStrategyFactory } from '@/main/lib/textExtractor/TextExtractorStrategyFactory';

describe('TextExtractorStrategyFactory', () => {
  describe('getStrategiesInPriorityOrder', () => {
    describe('正常系', () => {
      it('.txt拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.txt');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('txt-default');
        expect(strategies[0].getFormatType()).toBe('txt-plain');
      });

      it('.doc拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.doc');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('powershell-word');
      });

      it('.docx拡張子の戦略リストが正しいこと（リッチ優先→フォールバック）', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.docx');
        expect(strategies).toHaveLength(2);
        expect(strategies[0].getStrategyType()).toBe('docx-mammoth-rich');
        expect(strategies[0].getFormatType()).toBe('docx-rich-v1');
        expect(strategies[1].getStrategyType()).toBe('powershell-word');
        expect(strategies[1].getFormatType()).toBe('docx-plain');
      });

      it('.xls拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.xls');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('powershell-excel');
      });

      it('.xlsx拡張子の戦略リストが正しいこと（リッチ優先→フォールバック）', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.xlsx');
        expect(strategies).toHaveLength(2);
        expect(strategies[0].getStrategyType()).toBe('xlsx-sheetjs-rich');
        expect(strategies[0].getFormatType()).toBe('xlsx-rich-v2');
        expect(strategies[1].getStrategyType()).toBe('powershell-excel');
        expect(strategies[1].getFormatType()).toBe('xlsx-csv-v1');
      });

      it('.ppt拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.ppt');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('powershell-ppt');
      });

      it('.pptx拡張子の戦略リストが正しいこと（リッチ優先→フォールバック）', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.pptx');
        expect(strategies).toHaveLength(2);
        expect(strategies[0].getStrategyType()).toBe('pptx-rich');
        expect(strategies[0].getFormatType()).toBe('pptx-rich-v2');
        expect(strategies[1].getStrategyType()).toBe('powershell-ppt');
        expect(strategies[1].getFormatType()).toBe('pptx-plain');
      });

      it('.pdf拡張子の戦略リストが正しいこと（リッチ優先→フォールバック）', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.pdf');
        expect(strategies).toHaveLength(2);
        expect(strategies[0].getStrategyType()).toBe('pdfjs-rich');
        expect(strategies[0].getFormatType()).toBe('pdf-rich-v1');
        expect(strategies[1].getStrategyType()).toBe('pdfjs-dist');
        expect(strategies[1].getFormatType()).toBe('pdf-text-v1');
      });

      it('.csv拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.csv');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('txt-default');
        expect(strategies[0].getFormatType()).toBe('csv-plain');
      });

      it('.md拡張子の戦略リストが正しいこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.md');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('txt-default');
        expect(strategies[0].getFormatType()).toBe('md-plain');
      });

      it('大文字拡張子でも正しい戦略が取得できること', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.TXT');
        expect(strategies).toHaveLength(1);
        expect(strategies[0].getStrategyType()).toBe('txt-default');
      });

      it('混合ケースの拡張子でも正しい戦略が取得できること', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.Docx');
        expect(strategies).toHaveLength(2);
        expect(strategies[0].getStrategyType()).toBe('docx-mammoth-rich');
      });
    });

    describe('異常系', () => {
      it('サポートされていない拡張子の場合は空配列を返すこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('.zip');
        expect(strategies).toHaveLength(0);
      });

      it('空文字の拡張子の場合は空配列を返すこと', () => {
        const strategies =
          TextExtractorStrategyFactory.getStrategiesInPriorityOrder('');
        expect(strategies).toHaveLength(0);
      });
    });
  });

  describe('getAvailableStrategies', () => {
    describe('正常系', () => {
      it('.txt拡張子の戦略タイプ一覧が正しいこと', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.txt');
        expect(types).toEqual(['txt-default']);
      });

      it('.pdf拡張子の戦略タイプ一覧が正しいこと（リッチ＋プレーン）', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.pdf');
        expect(types).toEqual(['pdfjs-rich', 'pdfjs-dist']);
      });

      it('.docx拡張子の戦略タイプ一覧が正しいこと（リッチ＋プレーン）', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.docx');
        expect(types).toEqual(['docx-mammoth-rich', 'powershell-word']);
      });

      it('.xlsx拡張子の戦略タイプ一覧が正しいこと（リッチ＋プレーン）', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.xlsx');
        expect(types).toEqual(['xlsx-sheetjs-rich', 'powershell-excel']);
      });

      it('.pptx拡張子の戦略タイプ一覧が正しいこと（リッチ＋プレーン）', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.pptx');
        expect(types).toEqual(['pptx-rich', 'powershell-ppt']);
      });

      it('大文字拡張子でも正しい戦略タイプが取得できること', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.PDF');
        expect(types).toEqual(['pdfjs-rich', 'pdfjs-dist']);
      });
    });

    describe('異常系', () => {
      it('サポートされていない拡張子の場合は空配列を返すこと', () => {
        const types =
          TextExtractorStrategyFactory.getAvailableStrategies('.jpg');
        expect(types).toEqual([]);
      });
    });
  });

  describe('isSupported', () => {
    describe('正常系', () => {
      it.each([
        '.txt',
        '.csv',
        '.md',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.ppt',
        '.pptx',
        '.pdf',
      ])('%s はサポートされていること', (ext) => {
        expect(TextExtractorStrategyFactory.isSupported(ext)).toBe(true);
      });

      it('大文字拡張子でもサポート判定ができること', () => {
        expect(TextExtractorStrategyFactory.isSupported('.XLSX')).toBe(true);
      });
    });

    describe('異常系', () => {
      it.each(['.zip', '.jpg', '.png', '.html', ''])(
        '%s はサポートされていないこと',
        (ext) => {
          expect(TextExtractorStrategyFactory.isSupported(ext)).toBe(false);
        },
      );
    });
  });
});
