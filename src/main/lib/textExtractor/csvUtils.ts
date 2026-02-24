/**
 * RFC 4180準拠のCSVセルエスケープ
 * 改行・カンマ・ダブルクォートを含む場合にダブルクォートで囲む
 * 改行はスペースに変換せず保持する
 */
export function escapeCsvCell(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSVテキストをクォートフィールドを考慮して論理行に分割する
 * ダブルクォートで囲まれたフィールド内の改行は分割しない
 */
export function splitCsvIntoLogicalRows(csv: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        // エスケープされたダブルクォート ("") かクォート終了かを判定
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          current += '""';
          i++; // 次の " をスキップ
        } else {
          inQuotes = false;
          current += ch;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        current += ch;
      } else if (ch === '\r') {
        // \r\n を1つの改行として扱う
        if (i + 1 < csv.length && csv[i + 1] === '\n') {
          i++;
        }
        rows.push(current);
        current = '';
      } else if (ch === '\n') {
        rows.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  // 最後の行を追加（末尾改行の場合は空行を追加しない）
  if (current.length > 0) {
    rows.push(current);
  }

  return rows;
}
