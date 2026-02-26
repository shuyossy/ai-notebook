/**
 * カテゴリ分割ロジックのテスト
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
  // テンポラリディレクトリを使用（実際に存在するディレクトリ）
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

import {
  splitChecklistByFixedSize,
  consolidateCategories,
} from '@/mastra/workflows/sourceReview/lib';

describe('splitChecklistByFixedSize', () => {
  // ヘルパー関数: テスト用チェックリストを生成
  const makeChecklists = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      content: `チェック項目 ${i + 1}`,
    }));

  describe('正常系', () => {
    it('10件のチェックリストを3件ずつ分割すると[3, 3, 3, 1]になること', () => {
      const checklists = makeChecklists(10);
      const result = splitChecklistByFixedSize(checklists, 3);

      expect(result).toHaveLength(4);
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].checklists).toHaveLength(3);
      expect(result[2].checklists).toHaveLength(3);
      expect(result[3].checklists).toHaveLength(1);

      // 名前が正しく付与されること
      expect(result[0].name).toBe('Part 1');
      expect(result[3].name).toBe('Part 4');
    });

    it('6件のチェックリストを3件ずつ分割すると[3, 3]になること（割り切れる場合）', () => {
      const checklists = makeChecklists(6);
      const result = splitChecklistByFixedSize(checklists, 3);

      expect(result).toHaveLength(2);
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].checklists).toHaveLength(3);
    });

    it('1件のチェックリストをサイズ5で分割すると[1]になること', () => {
      const checklists = makeChecklists(1);
      const result = splitChecklistByFixedSize(checklists, 5);

      expect(result).toHaveLength(1);
      expect(result[0].checklists).toHaveLength(1);
    });

    it('5件のチェックリストを1件ずつ分割すると[1, 1, 1, 1, 1]になること', () => {
      const checklists = makeChecklists(5);
      const result = splitChecklistByFixedSize(checklists, 1);

      expect(result).toHaveLength(5);
      result.forEach((category) => {
        expect(category.checklists).toHaveLength(1);
      });
    });

    it('チェックリストの順序が保持されること', () => {
      const checklists = makeChecklists(6);
      const result = splitChecklistByFixedSize(checklists, 2);

      expect(result[0].checklists.map((c) => c.id)).toEqual([1, 2]);
      expect(result[1].checklists.map((c) => c.id)).toEqual([3, 4]);
      expect(result[2].checklists.map((c) => c.id)).toEqual([5, 6]);
    });
  });

  describe('異常系', () => {
    it('0件の場合は空配列を返すこと', () => {
      const result = splitChecklistByFixedSize([], 3);
      expect(result).toEqual([]);
    });

    it('サイズが0以下の場合はエラーをスローすること', () => {
      const checklists = makeChecklists(3);
      expect(() => splitChecklistByFixedSize(checklists, 0)).toThrow(
        'size must be at least 1',
      );
      expect(() => splitChecklistByFixedSize(checklists, -1)).toThrow(
        'size must be at least 1',
      );
    });
  });
});

describe('consolidateCategories', () => {
  describe('正常系', () => {
    it('targetSize以上のカテゴリがtargetSize件ずつチャンクされ、端数はunderflowに統合されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
            { id: 4, content: '項目4' },
            { id: 5, content: '項目5' },
          ],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // 5件 → 完全チャンク[3] + 端数(2件)がunderflow → [3, 2(その他)]
      expect(result).toHaveLength(2);
      expect(result[0].checklists).toHaveLength(3);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[1].checklists).toHaveLength(2);
      expect(result[1].name).toBe('その他');
    });

    it('targetSize未満のカテゴリのアイテムが集約されて統合されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
          ],
        },
        {
          name: 'カテゴリB',
          checklists: [{ id: 3, content: '項目3' }],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // 2+1=3件のunderflowアイテム → [3]
      expect(result).toHaveLength(1);
      expect(result[0].checklists).toHaveLength(3);
      expect(result[0].name).toBe('その他');
    });

    it('targetSize以上と未満が混在する場合に正しく処理されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
          ],
        },
        {
          name: 'カテゴリB',
          checklists: [{ id: 4, content: '項目4' }],
        },
        {
          name: 'カテゴリC',
          checklists: [{ id: 5, content: '項目5' }],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // カテゴリA(3件) → そのまま1チャンク
      // カテゴリB(1件) + カテゴリC(1件) → 統合して1チャンク(2件)
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].name).toBe('その他');
      expect(result[1].checklists).toHaveLength(2);
    });

    it('全てのカテゴリがちょうどtargetSizeの場合はそのまま返されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
          ],
        },
        {
          name: 'カテゴリB',
          checklists: [
            { id: 4, content: '項目4' },
            { id: 5, content: '項目5' },
            { id: 6, content: '項目6' },
          ],
        },
      ];

      const result = consolidateCategories(categories, 3);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[1].name).toBe('カテゴリB');
    });

    it('集約アイテムが複数チャンクになる場合にPart番号が付与されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [{ id: 1, content: '項目1' }],
        },
        {
          name: 'カテゴリB',
          checklists: [{ id: 2, content: '項目2' }],
        },
        {
          name: 'カテゴリC',
          checklists: [
            { id: 3, content: '項目3' },
            { id: 4, content: '項目4' },
          ],
        },
        {
          name: 'カテゴリD',
          checklists: [
            { id: 5, content: '項目5' },
            { id: 6, content: '項目6' },
          ],
        },
        {
          name: 'カテゴリE',
          checklists: [{ id: 7, content: '項目7' }],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // 全て3未満 → 集約: 7件 → [3, 3, 1]
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('その他 (Part 1)');
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].name).toBe('その他 (Part 2)');
      expect(result[1].checklists).toHaveLength(3);
      expect(result[2].name).toBe('その他 (Part 3)');
      expect(result[2].checklists).toHaveLength(1);
    });

    it('空のカテゴリ配列の場合は空配列を返すこと', () => {
      const result = consolidateCategories([], 3);
      expect(result).toEqual([]);
    });

    it('複数の大カテゴリの端数が統合されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
            { id: 4, content: '項目4' },
            { id: 5, content: '項目5' },
          ],
        },
        {
          name: 'カテゴリB',
          checklists: [
            { id: 6, content: '項目6' },
            { id: 7, content: '項目7' },
            { id: 8, content: '項目8' },
            { id: 9, content: '項目9' },
            { id: 10, content: '項目10' },
          ],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // カテゴリA(5件): 完全チャンク[3] + 端数(2件)
      // カテゴリB(5件): 完全チャンク[3] + 端数(2件)
      // 端数計4件 → [3, 1(その他)]
      // 合計: [3, 3, 3, 1]
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].name).toBe('カテゴリB');
      expect(result[1].checklists).toHaveLength(3);
      expect(result[2].name).toBe('その他 (Part 1)');
      expect(result[2].checklists).toHaveLength(3);
      expect(result[3].name).toBe('その他 (Part 2)');
      expect(result[3].checklists).toHaveLength(1);
    });

    it('大カテゴリの端数と小カテゴリが混合統合されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
            { id: 4, content: '項目4' },
          ],
        },
        {
          name: 'カテゴリB',
          checklists: [{ id: 5, content: '項目5' }],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // カテゴリA(4件): 完全チャンク[3] + 端数(1件)
      // カテゴリB(1件): underflow
      // 端数+underflow = 2件 → [2(その他)]
      // 合計: [3, 2]
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].name).toBe('その他');
      expect(result[1].checklists).toHaveLength(2);
    });

    it('targetSizeの倍数カテゴリは端数なしでそのまま分割されること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
            { id: 3, content: '項目3' },
            { id: 4, content: '項目4' },
            { id: 5, content: '項目5' },
            { id: 6, content: '項目6' },
          ],
        },
      ];

      const result = consolidateCategories(categories, 3);

      // 6件 → [3, 3] 端数なし
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('カテゴリA');
      expect(result[0].checklists).toHaveLength(3);
      expect(result[1].name).toBe('カテゴリA (Part 2)');
      expect(result[1].checklists).toHaveLength(3);
    });

    it('targetSize=1の場合は各チェックリストが個別カテゴリになること', () => {
      const categories = [
        {
          name: 'カテゴリA',
          checklists: [
            { id: 1, content: '項目1' },
            { id: 2, content: '項目2' },
          ],
        },
      ];

      const result = consolidateCategories(categories, 1);

      expect(result).toHaveLength(2);
      expect(result[0].checklists).toHaveLength(1);
      expect(result[1].checklists).toHaveLength(1);
    });
  });

  describe('異常系', () => {
    it('targetSizeが0以下の場合はエラーをスローすること', () => {
      expect(() => consolidateCategories([], 0)).toThrow(
        'targetSize must be at least 1',
      );
      expect(() => consolidateCategories([], -1)).toThrow(
        'targetSize must be at least 1',
      );
    });
  });
});
