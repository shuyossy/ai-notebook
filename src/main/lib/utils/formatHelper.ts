/**
 * テキスト抽出フォーマットに関するヘルパー関数（mainプロセス用）
 */

/**
 * リッチフォーマット（画像リンク・図形タグ等を含む）かどうかを判定
 * -rich-v1, -rich-v2 等のバージョンを全て受容する
 */
const RICH_FORMAT_PATTERN = /-rich-v\d+$/;
export function isRichFormatType(
  formatType: string | null | undefined,
): boolean {
  if (!formatType) return false;
  return RICH_FORMAT_PATTERN.test(formatType);
}
