import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

/** 抽出結果の型定義 */
export interface ExtractionResult {
  content: string;
  metadata: {
    fileType: string;
    encoding?: string;
    size: number;
    path: string;
  };
}

/** ファイル抽出エラーの型定義 */
interface FileExtractionError extends Error {
  code: string;
  filePath: string;
  fileType: string;
}

/** 多様なファイル形式からテキストを抽出するユーティリティクラス */
export default class FileExtractor {
  /** 処理可能な拡張子 */
  private static readonly SUPPORTED_EXTENSIONS = [
    '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf',
  ];

  /* ------------------------------------------------------------------ */
  /*  パブリック API                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * ファイルパスを受け取り、そのテキストとメタデータを返す
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
        `${filePath} のテキスト抽出に失敗しました: ${(error as Error).message}`,
        filePath,
        extension,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  拡張子別ハンドラ                                                  */
  /* ------------------------------------------------------------------ */

  private static async extractContentByType(filePath: string, ext: string): Promise<string> {
    switch (ext) {
      case '.doc':
      case '.docx':
        return this.extractViaPowerShell(filePath, 'word');
      case '.xls':
      case '.xlsx':
        return this.extractViaPowerShell(filePath, 'excel');
      case '.ppt':
      case '.pptx':
        return this.extractViaPowerShell(filePath, 'ppt');
      case '.pdf':
        return this.extractViaPowerShell(filePath, 'pdf');
      default:                                     // .txt
        return this.extractFromTxt(filePath);
    }
  }

  /** プレーンテキスト */
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
  /*  PowerShell 実行ラッパ                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Office COM を PowerShell で呼び出してテキストを取得
   * @param filePath 対象ファイル
   * @param mode     word / excel / ppt / pdf
   */
  private static async extractViaPowerShell(filePath: string, mode: 'word' | 'excel' | 'ppt' | 'pdf'): Promise<string> {
    const psScript = this.buildPsScript(mode, filePath);
    const tmp = path.join(os.tmpdir(), `fx-${mode}-${Date.now()}.ps1`);
    await fs.writeFile(tmp, psScript, 'utf8');

    try {
      const { stdout } = await execFileP(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },      // 20 MiB
      );
      return stdout.replace(/\r/g, '\n').trimEnd();
    } finally {
      await fs.unlink(tmp).catch(() => void 0);                 // 後始末
    }
  }

  /**
   * モード別に PowerShell スクリプト文字列を生成
   * （$Path 変数にファイルパスを直接埋め込む）
   */
  private static buildPsScript(mode: string, filePath: string): string {
    // パス中のシングルクォートは二重にしてエスケープ
    const safePath = filePath.replace(/'/g, "''");

    const commonHeader = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$Path = '${safePath}'
`;

    switch (mode) {
      /* ---------------------------- Word / PDF ---------------------- */
      case 'word':
      case 'pdf':
        return commonHeader + `
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc  = $word.Documents.Open($Path, \$false, \$true)
    $txt  = $doc.Content.Text                             # Document.Content.Text → Range.Text  [oai_citation:0‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/word.document.content?utm_source=chatgpt.com) [oai_citation:1‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/word.range.text?utm_source=chatgpt.com)
    $doc.Close()
    $word.Quit()
    Write-Output $txt
} finally {
    try { if ($doc)  { $doc.Close() } } catch {}
    try { if ($word) { $word.Quit() } } catch {}
}
`;

      /* ---------------------------- Excel --------------------------- */
      case 'excel':
        return commonHeader + `
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $wb = $excel.Workbooks.Open($Path, \$false, \$true)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ws in $wb.Worksheets) {
        $range = $ws.UsedRange                               # Worksheet.UsedRange  [oai_citation:2‡itbable.blogspot.com](https://itbable.blogspot.com/2013/06/find-used-range-in-excel-worksheet-with.html?utm_source=chatgpt.com)
        if ($null -ne $range) {
            $vals = $range.Value2                            # Range.Value2 ⇒ 2D Array  [oai_citation:3‡Microsoft Learn](https://learn.microsoft.com/en-us/office/vba/api/excel.range.value2?utm_source=chatgpt.com)
            if ($vals -is [System.Array]) {
                foreach ($row in $vals) {
                    if ($row -is [System.Array]) {
                        [void]$sb.AppendLine(($row -join "\t"))
                    } elseif ($row) {
                        [void]$sb.AppendLine($row)
                    }
                }
            } elseif ($vals) {
                [void]$sb.AppendLine($vals)
            }
        }
    }
    $wb.Close()
    $excel.Quit()
    Write-Output $sb.ToString()
} finally {
    try { if ($wb)    { $wb.Close() } }   catch {}
    try { if ($excel) { $excel.Quit() } } catch {}
}
`;

      /* --------------------------- PowerPoint ----------------------- */
      case 'ppt':
        return commonHeader + `
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = \$false
    $pres = $ppt.Presentations.Open($Path, \$false, \$true, \$false)
    $sb = New-Object System.Text.StringBuilder
    foreach ($slide in $pres.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {    # Shape.HasTextFrame  [oai_citation:4‡Microsoft Learn](https://learn.microsoft.com/ja-jp/office/vba/api/powerpoint.shape.hastextframe?utm_source=chatgpt.com)
                [void]$sb.AppendLine($shape.TextFrame.TextRange.Text)
            }
        }
    }
    $pres.Close()
    $ppt.Quit()
    Write-Output $sb.ToString()
} finally {
    try { if ($pres) { $pres.Close() } } catch {}
    try { if ($ppt)  { $ppt.Quit() }  } catch {}
}
`;

      default:
        throw new Error(`unsupported mode: ${mode}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  共通エラーヘルパ                                                  */
  /* ------------------------------------------------------------------ */

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
