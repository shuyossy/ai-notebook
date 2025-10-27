import type { CsvImportData, CustomEvaluationSettings } from '@/types';
import { internalError } from './error';

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
            // Excelファイル抽出時のシート名行（#sheet:で始まる行）をスキップ
            const isSheetNameRow = currentRow.length === 1 && currentRow[0].startsWith('#sheet:');
            if (!isSheetNameRow) {
              rows.push(currentRow);
            }
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
      // Excelファイル抽出時のシート名行（#sheet:で始まる行）をスキップ
      const isSheetNameRow = currentRow.length === 1 && currentRow[0].startsWith('#sheet:');
      if (!isSheetNameRow) {
        rows.push(currentRow);
      }
    }

    return rows;
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

  /**
   * 新フォーマットのCSV/Excelデータをパースする
   * ヘッダ行: チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
   * @param csvText CSVテキスト
   * @returns パース結果
   * @throws AppError パースに失敗した場合
   */
  public static parseImportFormat(csvText: string): CsvImportData {
    const rows = this.parse(csvText);

    if (rows.length === 0) {
      throw internalError({
        expose: true,
        messageCode: 'REVIEW_CHECKLIST_EXTRACTION_FILE_IMPORT_ERROR',
        messageParams: { detail: 'CSVファイルが空です' },
      });
    }

    // ヘッダ行の検証
    const headerRow = rows[0];
    const expectedHeaders = [
      'チェックリスト',
      '評定ラベル',
      '評定説明',
      '追加指示',
      'コメントフォーマット',
      'AI APIエンドポイント',
      'AI APIキー',
      'BPR ID',
    ];

    // ヘッダ行の列数検証
    if (headerRow.length !== expectedHeaders.length) {
      throw internalError({
        expose: true,
        messageCode: 'REVIEW_CHECKLIST_EXTRACTION_FILE_IMPORT_ERROR',
        messageParams: {
          detail: `CSVフォーマットが不正です。ヘッダ行は${expectedHeaders.length}列である必要がありますが、${headerRow.length}列でした`,
        },
      });
    }

    // 各ヘッダ列の内容検証
    for (let i = 0; i < expectedHeaders.length; i++) {
      const actualHeader = headerRow[i].trim();
      const expectedHeader = expectedHeaders[i];

      if (actualHeader !== expectedHeader) {
        throw internalError({
          expose: true,
          messageCode: 'REVIEW_CHECKLIST_EXTRACTION_FILE_IMPORT_ERROR',
          messageParams: {
            detail: `CSVフォーマットが不正です。${i + 1}列目のヘッダは「${expectedHeader}」である必要がありますが、「${actualHeader}」でした`,
          },
        });
      }
    }

    // データ行の解析
    const dataRows = rows.slice(1); // ヘッダ行を除く
    const checklists: string[] = [];
    const evaluationItems: Array<{ label: string; description: string }> = [];
    let additionalInstructions: string | undefined;
    let commentFormat: string | undefined;
    let apiUrl: string | undefined;
    let apiKey: string | undefined;
    let apiModel: string | undefined;

    for (const row of dataRows) {
      // 各列のデータを取得（空の場合はundefined）
      const checklistContent = row[0]?.trim() || undefined;
      const evalLabel = row[1]?.trim() || undefined;
      const evalDescription = row[2]?.trim() || undefined;
      const additionalInst = row[3]?.trim() || undefined;
      const commentFmt = row[4]?.trim() || undefined;
      const apiEndpoint = row[5]?.trim() || undefined;
      const apiKeyValue = row[6]?.trim() || undefined;
      const apiModelName = row[7]?.trim() || undefined;

      // チェックリスト項目の収集
      if (checklistContent) {
        checklists.push(checklistContent);
      }

      // 評定項目の収集（ラベルと説明の両方が必要）
      if (evalLabel && evalDescription) {
        evaluationItems.push({
          label: evalLabel,
          description: evalDescription,
        });
      }

      // 設定項目の収集（最初に見つかった値を使用）
      if (additionalInst && !additionalInstructions) {
        additionalInstructions = additionalInst;
      }
      if (commentFmt && !commentFormat) {
        commentFormat = commentFmt;
      }
      if (apiEndpoint && !apiUrl) {
        apiUrl = apiEndpoint;
      }
      if (apiKeyValue && !apiKey) {
        apiKey = apiKeyValue;
      }
      if (apiModelName && !apiModel) {
        apiModel = apiModelName;
      }
    }

    // インポートデータの構築
    const importData: CsvImportData = {
      checklists,
    };

    // 評定設定
    if (evaluationItems.length > 0) {
      importData.evaluationSettings = {
        items: evaluationItems,
      };
    }

    // その他の設定
    if (additionalInstructions) {
      importData.additionalInstructions = additionalInstructions;
    }
    if (commentFormat) {
      importData.commentFormat = commentFormat;
    }

    // API設定
    if (apiUrl || apiKey || apiModel) {
      importData.apiSettings = {
        url: apiUrl,
        key: apiKey,
        model: apiModel,
      };
    }

    return importData;
  }
}
