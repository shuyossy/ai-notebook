/**
 * deduplicateByChecklistId ユーティリティ関数のテスト
 * @jest-environment node
 */

// Electron モックを最初に適用（他のインポートより前に実行する必要がある）
jest.mock('electron', () => require('../test-utils/mockElectron').mockElectron);
jest.mock(
  'electron-store',
  () => require('../test-utils/mockElectron').default,
);

// main.ts の初期化処理をスキップ（テスト環境では不要）
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

import { deduplicateByChecklistId } from '@/mastra/workflows/sourceReview/executeReview/lib';

describe('deduplicateByChecklistId', () => {
  describe('正常系', () => {
    it('空配列を渡した場合、空配列とduplicateIds空配列が返ること', () => {
      const result = deduplicateByChecklistId([]);

      expect(result.deduplicated).toEqual([]);
      expect(result.duplicateIds).toEqual([]);
    });

    it('重複なしの配列を渡した場合、そのまま返却されること', () => {
      const items = [
        { checklistId: 1, comment: 'コメント1' },
        { checklistId: 2, comment: 'コメント2' },
      ];

      const result = deduplicateByChecklistId(items);

      expect(result.deduplicated).toEqual(items);
      expect(result.duplicateIds).toEqual([]);
    });

    it('単一の重複がある場合、最初の出現が保持されること', () => {
      const items = [
        { checklistId: 1, comment: '最初のコメント' },
        { checklistId: 1, comment: '重複コメント' },
        { checklistId: 2, comment: 'コメント2' },
      ];

      const result = deduplicateByChecklistId(items);

      expect(result.deduplicated).toEqual([
        { checklistId: 1, comment: '最初のコメント' },
        { checklistId: 2, comment: 'コメント2' },
      ]);
      expect(result.duplicateIds).toEqual([1]);
    });

    it('複数の重複がある場合、全て排除されること', () => {
      const items = [
        { checklistId: 1, comment: 'コメント1' },
        { checklistId: 2, comment: 'コメント2' },
        { checklistId: 1, comment: '重複1' },
        { checklistId: 2, comment: '重複2' },
        { checklistId: 3, comment: 'コメント3' },
      ];

      const result = deduplicateByChecklistId(items);

      expect(result.deduplicated).toEqual([
        { checklistId: 1, comment: 'コメント1' },
        { checklistId: 2, comment: 'コメント2' },
        { checklistId: 3, comment: 'コメント3' },
      ]);
      expect(result.duplicateIds).toEqual([1, 2]);
    });

    it('evaluationフィールドを含むオブジェクトでも正常に動作すること', () => {
      const items = [
        { checklistId: 1, comment: 'コメント1', evaluation: 'A' },
        { checklistId: 1, comment: '重複', evaluation: 'B' },
        { checklistId: 2, comment: 'コメント2', evaluation: 'C' },
      ];

      const result = deduplicateByChecklistId(items);

      expect(result.deduplicated).toEqual([
        { checklistId: 1, comment: 'コメント1', evaluation: 'A' },
        { checklistId: 2, comment: 'コメント2', evaluation: 'C' },
      ]);
      expect(result.duplicateIds).toEqual([1]);
    });
  });
});
