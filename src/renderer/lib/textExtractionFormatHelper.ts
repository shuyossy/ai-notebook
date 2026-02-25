/**
 * テキスト抽出フォーマットに関するヘルパー関数
 * web版 TextExtractionFormatType.ts から移植
 */

/**
 * リッチフォーマット（画像リンク・図形タグ等を含む）かどうかを判定
 */
export function isRichFormatType(formatType: string | null): boolean {
  if (!formatType) return false;
  return formatType.endsWith('-rich-v1');
}

/**
 * プレーンオンリーフォーマット（画像・図形抽出の概念がない形式）かどうかを判定
 * txt, csv はそもそもバイナリファイルではないため、画像・図形抽出対象外
 */
export function isPlainOnlyFormatType(formatType: string | null): boolean {
  if (!formatType) return false;
  return (
    formatType === 'txt-plain' ||
    formatType === 'csv-plain' ||
    formatType === 'md-plain'
  );
}

/**
 * ファイル拡張子からリッチ戦略が存在するかを判定
 * xlsx, docx, pptx, pdf にはリッチ戦略が存在する
 */
export function hasRichStrategyAvailable(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ['xlsx', 'docx', 'pptx', 'pdf'].includes(ext);
}
