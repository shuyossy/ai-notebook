/* eslint import/prefer-default-export: off */
import { URL, pathToFileURL } from 'url';
import path from 'path';

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

/**
 * @param dirOrPath ディレクトリ or パス文字列
 * @param fileName   結合したいファイル名またはパス片（省略可）
 * @returns 絶対パス文字列
 * @throws Error ファイル名を含む第一引数に対して fileName が指定された場合
 */
export function toAbsolutePath(dirOrPath: string, fileName?: string): string {
  // 第一引数を絶対パスに変換（相対→絶対 or そのまま）
  const basePath = path.isAbsolute(dirOrPath)
    ? dirOrPath
    : path.resolve(dirOrPath);

  if (fileName !== undefined) {
    // 第一引数に拡張子があれば「ファイル名＋fileName の二重指定」とみなして例外
    if (path.extname(dirOrPath) !== '') {
      throw new Error(
        `第一引数にファイル名が含まれています: "${dirOrPath}". fileName と重複指定はできません。`,
      );
    }
    // ディレクトリ部を取り出して結合
    return path.join(basePath, fileName);
  }

  return basePath;
}

/**
 * @param dirOrPath ディレクトリ or パス文字列
 * @param fileName   結合したいファイル名またはパス片（省略可）
 * @returns 絶対fileURL文字列
 * @throws Error ファイル名を含む第一引数に対して fileName が指定された場合
 */
export function toAbsoluteFileURL(
  dirOrPath: string,
  fileName?: string,
): string {
  return pathToFileURL(toAbsolutePath(dirOrPath, fileName)).href;
}
