import fs from 'fs/promises';
import path from 'path';

/**
 * 抽出結果の型定義
 */
export interface ExtractionResult {
  content: string;
  metadata: {
    fileType: string;
    encoding?: string;
    size: number;
    path: string;
  };
}

/**
 * ファイル抽出エラーの型定義
 */
interface FileExtractionError extends Error {
  code: string;
  filePath: string;
  fileType: string;
}

/**
 * 多様なファイル形式からテキストを抽出するユーティリティクラス
 */
export default class FileExtractor {
  /** 処理可能な拡張子 */
  private static readonly SUPPORTED_EXTENSIONS = [
    '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf',
  ];

  /** メイン API */
  public static async extractText(filePath: string): Promise<ExtractionResult> {
    const extension = path.extname(filePath).toLowerCase();

    if (!this.SUPPORTED_EXTENSIONS.includes(extension)) {
      throw this.createError(
        'unsupported_file_type',
        'サポートされていないファイル形式です',
        filePath,
        extension,
      );
    }

    try {
      const stats = await fs.stat(filePath);
      const content = await this.extractContentByType(filePath, extension);

      return {
        content,
        metadata: {
          fileType: extension,
          size: stats.size,
          path: filePath,
          encoding: 'utf-8',
        },
      };
    } catch (error) {
      throw this.createError(
        'extraction_failed',
        `${filePath} のテキスト抽出に失敗しました: ${(error as Error).message}`,
        filePath,
        extension,
      );
    }
  }

  /** 種別ごとの振り分け */
  private static async extractContentByType(filePath: string, ext: string): Promise<string> {
    switch (ext) {
      case '.docx':
      case '.doc':
        return this.extractFromWord(filePath);
      case '.xlsx':
      case '.xls':
        return this.extractFromExcel(filePath);
      case '.pptx':
      case '.ppt':
        return this.extractFromPowerPoint(filePath);
      case '.pdf':
        return this.extractFromPdf(filePath);
      default:
        return this.extractFromTxt(filePath);
    }
  }

  /** .txt */
  private static async extractFromTxt(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw this.createError(
        'txt_extraction_failed',
        `テキストファイルの読み込みに失敗しました: ${(error as Error).message}`,
        filePath,
        '.txt',
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  以下はすべて winax + Office COM オートメーションで実装            */
  /* ------------------------------------------------------------------ */

  /**
   * Word / RTF / PDF (Word が PDF を開ける場合)
   */
  private static async extractFromWord(filePath: string): Promise<string> {
    const winax = await import('winax');
    const word = new winax.Object('Word.Application', { activate: false });
    try {
      word.Visible = false;
      const doc = word.Documents.Open(filePath, false, true); // read-only
      const text: string = doc.Content.Text;                     // Word VBA: Document.Content.Text  [oai_citation:0‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/word.document.content?utm_source=chatgpt.com) [oai_citation:1‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/word.range.text?utm_source=chatgpt.com)
      doc.Close(false);
      return text.replace(/\r/g, '\n').trim();
    } finally {
      word.Quit();
      winax.release(word);
    }
  }

  /**
   * Excel (.xls / .xlsx)
   */
  private static async extractFromExcel(filePath: string): Promise<string> {
    const winax = await import('winax');
    const excel = new winax.Object('Excel.Application', { activate: false });
    try {
      excel.Visible = false;
      const wb = excel.Workbooks.Open(filePath, false, true); // read-only
      let out = '';
      for (let i = 1; i <= wb.Worksheets.Count; i++) {
        const sheet = wb.Worksheets.Item(i);
        const used = sheet.UsedRange;                           // Worksheet.UsedRange  [oai_citation:2‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/excel.worksheet.usedrange?utm_source=chatgpt.com)
        if (!used) continue;
        const values = used.Value;                              // Range.Value ⇒ 2D 配列  [oai_citation:3‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/excel.range.value?utm_source=chatgpt.com)
        if (Array.isArray(values)) {
          for (const row of values) {
            out += (row as unknown[]).map(v => (v ?? '')).join('\t') + '\n';
          }
        } else if (values !== undefined && values !== null) {
          out += `${values}\n`;
        }
      }
      wb.Close(false);
      return out.trim();
    } finally {
      excel.Quit();
      winax.release(excel);
    }
  }

  /**
   * PowerPoint (.ppt / .pptx)
   */
  private static async extractFromPowerPoint(filePath: string): Promise<string> {
    const winax = await import('winax');
    const ppt = new winax.Object('PowerPoint.Application', { activate: false });
    try {
      ppt.Visible = false;
      const pres = ppt.Presentations.Open(filePath, false, true, false);
      let out = '';
      for (let i = 1; i <= pres.Slides.Count; i++) {
        const slide = pres.Slides.Item(i);
        for (let j = 1; j <= slide.Shapes.Count; j++) {
          const shape = slide.Shapes.Item(j);
          if (shape.HasTextFrame && shape.TextFrame.HasText) {   // Shape.TextFrame.HasText  [oai_citation:4‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.shape.textframe?utm_source=chatgpt.com)
            out += shape.TextFrame.TextRange.Text + '\n';
          }
        }
      }
      pres.Close();
      return out.trim();
    } finally {
      ppt.Quit();
      winax.release(ppt);
    }
  }

  /**
   * PDF (Word で開ける場合のみ)
   */
  private static async extractFromPdf(filePath: string): Promise<string> {
    try {
      // Word が PDF を読み取れる場合はそのまま利用
      return await this.extractFromWord(filePath);
    } catch (e) {
      throw this.createError(
        'pdf_extraction_failed',
        'Word 経由で PDF を開けませんでした。Acrobat COM など別手段が必要です。',
        filePath,
        '.pdf',
      );
    }
  }

  /* ------------------------------------------------------------------ */

  /** 共通エラーヘルパ */
  private static createError(
    code: string,
    message: string,
    filePath: string,
    fileType: string,
  ): FileExtractionError {
    const err = new Error(message) as FileExtractionError;
    err.code = code;
    err.filePath = filePath;
    err.fileType = fileType;
    err.name = 'FileExtractionError';
    return err;
  }
}
