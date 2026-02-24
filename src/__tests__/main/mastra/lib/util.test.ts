/**
 * @jest-environment node
 */

import {
  removeImageLinks,
  makeChunksByCount,
  filterReferencedImages,
} from '@/mastra/lib/util';
import type { ExtractedImage } from '@/types/review';

describe('removeImageLinks', () => {
  describe('正常系', () => {
    it('画像リンクを正しく除去できること', () => {
      const input = 'テキスト前\n![image](image_1.png)\nテキスト後';
      const result = removeImageLinks(input);
      expect(result).toBe('テキスト前\nテキスト後');
    });

    it('複数の画像リンクを全て除去できること', () => {
      const input =
        '段落1\n![img1](image_1.png)\n段落2\n![img2](image_2.png)\n段落3';
      const result = removeImageLinks(input);
      expect(result).toBe('段落1\n段落2\n段落3');
    });

    it('alt属性付きの画像リンクを除去できること', () => {
      const input = 'テキスト\n![Figure 1: 概要図](diagram.png)\n続き';
      const result = removeImageLinks(input);
      expect(result).toBe('テキスト\n続き');
    });

    it('画像リンクがないテキストはそのまま返すこと', () => {
      const input = 'テキストのみのドキュメント\n改行あり';
      const result = removeImageLinks(input);
      expect(result).toBe(input);
    });

    it('空文字列を渡した場合は空文字列を返すこと', () => {
      expect(removeImageLinks('')).toBe('');
    });

    it('画像リンク除去後の連続空行を2行に圧縮すること', () => {
      const input = 'テキスト前\n\n\n![image](image_1.png)\n\n\nテキスト後';
      const result = removeImageLinks(input);
      // 画像リンク除去後に3行以上の空行ができた場合、2行に圧縮される
      expect(result).not.toContain('\n\n\n');
    });

    it('行末に改行がない画像リンクも除去できること', () => {
      const input = 'テキスト前\n![image](image_1.png)';
      const result = removeImageLinks(input);
      expect(result).toBe('テキスト前\n');
    });

    it('画像リンクのみのテキストを除去できること', () => {
      const input = '![image](image_1.png)';
      const result = removeImageLinks(input);
      expect(result).toBe('');
    });
  });

  describe('異常系', () => {
    it('不完全な画像リンク（閉じカッコなし）は除去されないこと', () => {
      const input = 'テキスト\n![image](image_1.png\n続き';
      const result = removeImageLinks(input);
      expect(result).toBe(input);
    });

    it('通常のMarkdownリンクは除去されないこと', () => {
      const input = 'テキスト\n[参考リンク](https://example.com)\n続き';
      const result = removeImageLinks(input);
      expect(result).toBe(input);
    });
  });
});

describe('filterReferencedImages', () => {
  const sampleImages: ExtractedImage[] = [
    {
      referenceId: 'image_1.png',
      base64Data: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
    },
    {
      referenceId: 'image_2.png',
      base64Data: 'data:image/png;base64,BBB',
      mimeType: 'image/png',
    },
    {
      referenceId: 'diagram_1.png',
      base64Data: 'data:image/png;base64,CCC',
      mimeType: 'image/png',
    },
  ];

  describe('正常系', () => {
    it('テキスト内で参照されている画像のみを抽出できること', () => {
      const text = 'テキスト前\n![画像1](image_1.png)\nテキスト後';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(1);
      expect(result[0].referenceId).toBe('image_1.png');
    });

    it('複数の画像リンクがある場合、全て正しく抽出できること', () => {
      const text =
        '段落1\n![img1](image_1.png)\n段落2\n![img2](diagram_1.png)\n段落3';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(2);
      expect(result.map((img) => img.referenceId)).toEqual([
        'image_1.png',
        'diagram_1.png',
      ]);
    });

    it('全ての画像が参照されている場合、全て返すこと', () => {
      const text = '![a](image_1.png)\n![b](image_2.png)\n![c](diagram_1.png)';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(3);
    });

    it('画像リンクがないテキストの場合、空配列を返すこと', () => {
      const text = '画像リンクを含まないテキスト';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(0);
    });

    it('空のテキストの場合、空配列を返すこと', () => {
      const result = filterReferencedImages('', sampleImages);
      expect(result).toHaveLength(0);
    });

    it('空の画像配列の場合、空配列を返すこと', () => {
      const text = '![画像1](image_1.png)';
      const result = filterReferencedImages(text, []);
      expect(result).toHaveLength(0);
    });

    it('同じ画像が複数回参照されていても、重複なく1つだけ返すこと', () => {
      const text = '![img1](image_1.png)\n中間\n![img1再掲](image_1.png)';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(1);
      expect(result[0].referenceId).toBe('image_1.png');
    });
  });

  describe('異常系', () => {
    it('存在しない画像IDが参照されている場合、該当画像はスキップされること', () => {
      const text = '![存在しない](nonexistent.png)\n![存在する](image_1.png)';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(1);
      expect(result[0].referenceId).toBe('image_1.png');
    });

    it('不完全な画像リンクはマッチしないこと', () => {
      const text = '![image](image_1.png\n続き';
      const result = filterReferencedImages(text, sampleImages);
      expect(result).toHaveLength(0);
    });
  });
});

describe('makeChunksByCount', () => {
  describe('正常系', () => {
    it('テキストを指定数に等分できること', () => {
      const text = 'abcdefghij'; // 10文字
      const result = makeChunksByCount(text, 2, 0);
      expect(result).toHaveLength(2);
      // 各チャンクが正しい範囲をカバー
      expect(text.substring(result[0].start, result[0].end)).toBe('abcde');
      expect(text.substring(result[1].start, result[1].end)).toBe('fghij');
    });

    it('オーバーラップ付きで分割できること', () => {
      const text = 'abcdefghijklmnopqrst'; // 20文字
      const result = makeChunksByCount(text, 2, 3);
      expect(result).toHaveLength(2);
      // 最初のチャンクはオーバーラップ分延長（end > base幅）
      expect(result[0].end).toBeGreaterThan(10);
      // 2番目のチャンクは前方にオーバーラップ（start <= base開始位置）
      expect(result[1].start).toBeLessThanOrEqual(10);
      // 最後のチャンクはtotalまで
      expect(result[1].end).toBe(20);
    });

    it('splitCount=1の場合、全体を1チャンクで返すこと', () => {
      const text = 'abcdefghij';
      const result = makeChunksByCount(text, 1, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: 10 });
    });

    it('splitCountがデータ長より大きい場合でも正しく分割できること', () => {
      const text = 'abc'; // 3文字
      const result = makeChunksByCount(text, 5, 0);
      // 最初と最後のチャンクで全体がカバーされること
      expect(result[0].start).toBe(0);
      expect(result[result.length - 1].end).toBe(3);
    });

    it('配列に対しても分割できること', () => {
      const arr = [1, 2, 3, 4, 5, 6];
      const result = makeChunksByCount(arr, 3, 1);
      expect(result).toHaveLength(3);
      // 最後のチャンクが全体を含む
      expect(result[result.length - 1].end).toBe(6);
    });

    it('最後のチャンクが必ずデータ末尾まで到達すること', () => {
      const text = 'abcdefghijk'; // 11文字（3で割り切れない）
      const result = makeChunksByCount(text, 3, 0);
      expect(result[result.length - 1].end).toBe(11);
    });
  });

  describe('異常系', () => {
    it('空データの場合、start=0, end=0の1チャンクを返すこと', () => {
      const result = makeChunksByCount('', 3, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: 0 });
    });

    it('splitCount=0の場合、start=0, end=0の1チャンクを返すこと', () => {
      const result = makeChunksByCount('abc', 0, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: 0 });
    });

    it('splitCountが負数の場合、start=0, end=0の1チャンクを返すこと', () => {
      const result = makeChunksByCount('abc', -1, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: 0 });
    });
  });
});
