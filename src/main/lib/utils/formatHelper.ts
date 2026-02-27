/**
 * テキスト抽出フォーマットに関するヘルパー関数（mainプロセス用）
 */

/**
 * リッチフォーマット（画像リンク・図形タグ等を含む）かどうかを判定
 */
export function isRichFormatType(
  formatType: string | null | undefined,
): boolean {
  if (!formatType) return false;
  return formatType.endsWith('-rich-v1');
}
