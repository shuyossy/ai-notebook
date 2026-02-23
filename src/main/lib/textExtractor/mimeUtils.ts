/**
 * MIMEタイプと拡張子のマッピングユーティリティ
 * テキスト抽出戦略間で共有する
 */

/** MIMEタイプから拡張子へのマッピング */
export const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
};

/** 拡張子からMIMEタイプへの逆引きマッピング（エイリアス含む） */
export const EXT_TO_MIME: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime]),
  ),
  // MIME_TO_EXT逆引きで生成されないエイリアスを追加
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
};

/**
 * MIMEタイプから拡張子を取得する
 * @param mimeType MIMEタイプ
 * @param defaultExt 不明な場合のデフォルト拡張子
 * @returns 拡張子（ドットなし）
 */
export function getExtFromMime(
  mimeType: string,
  defaultExt: string = 'png',
): string {
  return MIME_TO_EXT[mimeType] ?? defaultExt;
}

/**
 * 拡張子からMIMEタイプを取得する
 * @param ext 拡張子（ドットなし）
 * @param defaultMime 不明な場合のデフォルトMIMEタイプ
 * @returns MIMEタイプ
 */
export function getMimeFromExt(
  ext: string,
  defaultMime: string = 'image/png',
): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? defaultMime;
}
