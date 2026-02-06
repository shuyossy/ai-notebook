/**
 * ファイル操作に関する共通ユーティリティ関数
 */

/**
 * ファイル拡張子からMIMEタイプを取得する
 * @param extension ファイル拡張子（ドットなし）
 * @returns 対応するMIMEタイプ、未知の拡張子の場合は 'application/octet-stream'
 */
export const getMimeTypeFromExtension = (extension: string): string => {
  const mimeTypes: { [key: string]: string } = {
    // 画像
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    // ドキュメント
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * ArrayBuffer（Uint8Array）をBase64文字列に変換する
 * @param buffer 変換対象のUint8Array
 * @returns Base64エンコードされた文字列
 */
export const arrayBufferToBase64 = (buffer: Uint8Array): string => {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
};

/**
 * FileオブジェクトをData URL形式に変換する
 * @param file 変換対象のFileオブジェクト
 * @returns Data URL形式の文字列を解決するPromise
 */
export const fileToDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
