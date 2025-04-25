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
  /**
   * 処理可能なファイル形式
   */
  private static readonly SUPPORTED_EXTENSIONS = [
    '.txt',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.pdf',
  ];

  /**
   * ファイル形式に基づいてテキストを抽出する
   * @param filePath ファイルパス
   * @returns 抽出結果
   */
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
        `${filePath}のテキスト抽出に失敗しました: ${(error as Error).message}`,
        filePath,
        extension,
      );
    }
  }

  /**
   * ファイル形式別のテキスト抽出処理
   */
  private static async extractContentByType(
    filePath: string,
    extension: string,
  ): Promise<string> {
    switch (extension) {
      case '.docx':
      case '.doc':
        return this.extractFromDoc(filePath);
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

  /**
   * テキストファイルからテキストを抽出する
   */
  private static async extractFromTxt(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw this.createError(
        'txt_extraction_failed',
        `テキストファイルの読み込みに失敗しました: ${(error as Error).message}`,
        filePath,
        '.txt',
      );
    }
  }

  /**
   * Word文書からテキストを抽出する (モック)
   */
  // eslint-disable-next-line
  private static async extractFromDoc(filePath: string): Promise<string> {
    // 注: 実際の実装ではdocx-parserなどのライブラリを使用
    return 'Word文書からのテキスト抽出はモック実装です。';
  }

  /**
   * Excelファイルからテキストを抽出する (モック)
   */
  // eslint-disable-next-line
  private static async extractFromExcel(filePath: string): Promise<string> {
    // 注: 実際の実装ではxlsx-populateなどのライブラリを使用
    return 'Excelファイルからのテキスト抽出はモック実装です。';
  }

  /**
   * PowerPointファイルからテキストを抽出する (モック)
   */
  private static async extractFromPowerPoint(
    // eslint-disable-next-line
    filePath: string,
  ): Promise<string> {
    // 注: 実際の実装ではpptxgenjs-to-textなどのライブラリを使用
    return 'PowerPointファイルからのテキスト抽出はモック実装です。';
  }

  /**
   * PDFファイルからテキストを抽出する (モック)
   */
  // eslint-disable-next-line
  private static async extractFromPdf(filePath: string): Promise<string> {
    // 注: 実際の実装ではpdf-parse-jsなどのライブラリを使用
    return 'PDFファイルからのテキスト抽出はモック実装です。';
  }

  /**
   * エラーオブジェクトを作成する
   */
  private static createError(
    code: string,
    message: string,
    filePath: string,
    fileType: string,
  ): FileExtractionError {
    const error = new Error(message) as FileExtractionError;
    error.code = code;
    error.filePath = filePath;
    error.fileType = fileType;
    error.name = 'FileExtractionError';
    return error;
  }
}
