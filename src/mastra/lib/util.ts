/**
 * 文書を等分ベースで分割し、指定のオーバーラップを安全に付与する関数
 * - テキスト: overlapChars 文字
 * - 画像配列: overlapItems 個
 * - 取りこぼし無し、負インデックス無し、end超過はクリップ
 * - 各チャンクに原文カバレッジ範囲（start,end）をメタとして付与
 */
export function makeChunksByCount<T extends { length: number }>(
  data: T,
  splitCount: number,
  overlap: number,
): Array<{ start: number; end: number }> {
  const total = data.length;

  // ガード: 空データや不正パラメータ
  if (total === 0 || splitCount <= 0) {
    return [{ start: 0, end: 0 }];
  }

  // ベースとなる等分幅（オーバーラップを除いた基準幅）
  const base = Math.ceil(total / splitCount);

  const ranges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < splitCount; i++) {
    // ベースの等分範囲（半開区間）
    const baseStart = i * base;
    const baseEnd = Math.min((i + 1) * base, total);

    // オーバーラップは、前後に付与するが、両端は片側のみ
    const extendLeft = i > 0 ? overlap : 0;
    const extendRight = i < splitCount - 1 ? overlap : 0;

    // 実際のチャンク開始・終了（安全にクリップ）
    const start = Math.max(0, baseStart - extendLeft);
    const end = Math.min(total, baseEnd + extendRight);

    // 連続性をさらに堅牢にするため、前チャンクの end を下回らないように調整
    if (ranges.length > 0) {
      const prevEnd = ranges[ranges.length - 1].end;
      // 万一、計算誤差で「隙間」が出る場合は、start を前の end に寄せる
      const fixedStart = Math.min(Math.max(start, prevEnd - overlap), total);
      ranges.push({ start: fixedStart, end });
    } else {
      ranges.push({ start, end });
    }
  }

  // 念のため、最後のチャンクが必ず total まで伸びていることを保証
  ranges[ranges.length - 1].end = total;

  return ranges;
}
