/**
 * CSV解析のためのユーティリティクラス
 * RFC 4180準拠の基本的なCSVパース機能を提供
 * セル内改行や特殊文字を適切に処理する
 */
export class CsvParser {
  /**
   * CSVテキストを解析して2次元配列として返す
   * @param csvText CSVテキスト
   * @returns 2次元配列（行ごとのセル配列）
   */
  public static parse(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;

    while (i < csvText.length) {
      const char = csvText[i];
      const nextChar = i + 1 < csvText.length ? csvText[i + 1] : null;

      if (!inQuotes) {
        // クォート外の処理
        if (char === '"') {
          // クォート開始
          inQuotes = true;
        } else if (char === ',') {
          // セル区切り
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n' || char === '\r') {
          // 行区切り
          if (char === '\r' && nextChar === '\n') {
            // CRLF の場合は次の文字もスキップ
            i++;
          }
          currentRow.push(currentCell.trim());
          if (currentRow.length > 0 && !this.isEmptyRow(currentRow)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          // 通常の文字
          currentCell += char;
        }
      } else {
        // クォート内の処理
        if (char === '"') {
          if (nextChar === '"') {
            // エスケープされたクォート（""）
            currentCell += '"';
            i++; // 次の文字もスキップ
          } else {
            // クォート終了
            inQuotes = false;
          }
        } else {
          // クォート内の文字（改行も含む）
          currentCell += char;
        }
      }

      i++;
    }

    // 最後のセルと行を追加
    currentRow.push(currentCell.trim());
    if (currentRow.length > 0 && !this.isEmptyRow(currentRow)) {
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * CSVの1列目の値のみを抽出する
   * @param csvText CSVテキスト
   * @returns 1列目の値の配列（空でない値のみ）
   */
  public static extractFirstColumn(csvText: string): string[] {
    const rows = this.parse(csvText);
    const firstColumnValues: string[] = [];

    for (const row of rows) {
      if (row.length > 0) {
        const firstCell = row[0];
        if (firstCell && firstCell.trim() !== '') {
          firstColumnValues.push(firstCell.trim());
        }
      }
    }

    return firstColumnValues;
  }

  /**
   * 行が空かどうかを判定する
   * @param row 行データ
   * @returns 空行の場合true
   */
  private static isEmptyRow(row: string[]): boolean {
    return row.every((cell) => cell.trim() === '');
  }

  /**
   * CSVの形式が正しいかを簡易的に検証する
   * @param csvText CSVテキスト
   * @returns 検証結果
   */
  public static validate(csvText: string): {
    isValid: boolean;
    error?: string;
  } {
    try {
      let inQuotes = false;
      let quoteCount = 0;

      for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = i + 1 < csvText.length ? csvText[i + 1] : null;

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // エスケープされたクォート
            i++; // 次の文字もスキップ
          } else {
            inQuotes = !inQuotes;
            quoteCount++;
          }
        }
      }

      // クォートが閉じられていない場合
      if (inQuotes) {
        return { isValid: false, error: 'クォートが正しく閉じられていません' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `CSV解析エラー: ${error}` };
    }
  }
}
