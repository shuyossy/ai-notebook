/* eslint-disable */
/**
 * FileExtractor ― 多様なファイルからテキストを抽出するユーティリティ
 * --------------------------------------------------------------
 *  ・Word / Excel / PowerPoint は PowerShell＋COM で抽出
 *  ・PDF は pdfjs-dist (ESM) で抽出
 *  ・TXT はそのまま読み込み
 *
 *  ★ Excel／Word／PowerPoint すべてで「ダイアログ抑止」と
 *    「保存確認フラグ（dirty flag）解除」を徹底しているため、
 *    無人実行でもハングしません。
 */

import fs from 'fs/promises';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

const execFileP = promisify(execFile);

/* --------------------------------------------------------------
 * 型定義
 * ------------------------------------------------------------ */

/** 抽出結果の型 */
export interface ExtractionResult {
  content: string;
  metadata: {
    fileType: string;
    encoding?: string;
    size: number;
    path: string;
  };
}

/** 共通の抽出エラー型 */
interface FileExtractionError extends Error {
  code: string;
  filePath: string;
  fileType: string;
}

/* --------------------------------------------------------------
 * FileExtractor 本体
 * ------------------------------------------------------------ */
export default class FileExtractor {
  /** 処理可能な拡張子 */
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
   * パブリック API ― ファイルを受け取り
   * テキストとメタデータを返す
   */
  public static async extractText(filePath: string): Promise<ExtractionResult> {
    const extension = path.extname(filePath).toLowerCase();

    // 必要なら拡張子チェックを有効化
    // if (!this.SUPPORTED_EXTENSIONS.includes(extension)) {
    //   throw this.createError(
    //     'unsupported_file_type',
    //     'サポートされていないファイル形式です',
    //     filePath,
    //     extension,
    //   );
    // }

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

  /* ------------------------------------------------------------
   * 拡張子別ディスパッチ
   * ---------------------------------------------------------- */

  private static async extractContentByType(
    filePath: string,
    ext: string,
  ): Promise<string> {
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
        return this.extractFromPdf(filePath);
      default: // .txt
        return this.extractFromTxt(filePath);
    }
  }

  /** プレーンテキストを読み込む */
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

  /* ------------------------------------------------------------
   * PowerShell＋COM ラッパ
   * ---------------------------------------------------------- */

  /**
   * Office COM を PowerShell から呼び出してテキスト抽出
   *
   * @param filePath 対象ファイル
   * @param mode     word | excel | ppt
   */
  private static async extractViaPowerShell(
    filePath: string,
    mode: 'word' | 'excel' | 'ppt',
  ): Promise<string> {
    const psScript = this.buildPsScript(mode, filePath);
    const tmp = path.join(os.tmpdir(), `fx-${mode}-${Date.now()}.ps1`);

    // BOM 付き UTF-8 で書き出し（PowerShell で文字化け防止）
    await fs.writeFile(tmp, '\uFEFF' + psScript, { encoding: 'utf8' });

    try {
      const { stdout } = await execFileP(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          tmp,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024 * 20, // 20 MiB
        },
      );
      return stdout.replace(/\r/g, '\n').trimEnd();
    } finally {
      // 一時スクリプトを削除（失敗しても無視）
      await fs.unlink(tmp).catch(() => void 0);
    }
  }

  /**
   * PowerShell スクリプト生成
   *   - DisplayAlerts でダイアログ抑止
   *   - Saved = $true と Close(False) で保存確認を回避
   *   - COM オブジェクトを確実に解放
   */
  private static buildPsScript(
    mode: 'word' | 'excel' | 'ppt',
    filePath: string,
  ): string {
    // パス中のシングルクォートをエスケープ
    const safePath = filePath.replace(/'/g, "''");

    // 共通前置き
    const header = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$Path = '${safePath}'
`;

    /* ---------------- Word ---------------- */
    if (mode === 'word') {
      return (
        header +
        `
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible       = $false
    $word.DisplayAlerts = 0            # wdAlertsNone

    # 引数: FileName, ConfirmConversions, ReadOnly
    $doc = $word.Documents.Open($Path, \$false, \$true)

    $txt = $doc.Content.Text
    $doc.Saved = \$true                # dirty flag 解除
    $doc.Close(\$false)                # SaveChanges:=False
    $word.Quit()
    Write-Output $txt
}
finally {
    try { if ($doc)  { $doc.Close(\$false) } } catch {}
    try { if ($word) { $word.Quit()       } } catch {}
    # COM 解放（保険）
    try {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc)  | Out-Null
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    } catch {}
}
`
      );
    }

    /* ---------------- Excel --------------- */
    if (mode === 'excel') {
      return (
        header +
        `
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible       = $false
    $excel.DisplayAlerts = $false      # すべてのプロンプトを抑止

    # 引数: Filename, UpdateLinks, ReadOnly
    $wb = $excel.Workbooks.Open($Path, 0, \$true)

    $sb = New-Object System.Text.StringBuilder
    foreach ($ws in $wb.Worksheets) {
        $range = $ws.UsedRange
        if ($null -ne $range) {
            $vals = $range.Value2
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

    $wb.Saved = \$true                 # dirty flag 解除
    $wb.Close(\$false)                 # 保存せずに閉じる
    $excel.Quit()
    Write-Output $sb.ToString()
}
finally {
    try { if ($wb)    { $wb.Close(\$false) } } catch {}
    try { if ($excel) { $excel.Quit()      } } catch {}
    try {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb)    | Out-Null
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    } catch {}
}
`
      );
    }

    /* ---------------- PowerPoint ---------- */
    if (mode === 'ppt') {
      return (
        header +
        `
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.DisplayAlerts = 2            # ppAlertsNone

    # 引数: FileName, ReadOnly, Untitled, WithWindow
    $pres = $ppt.Presentations.Open($Path, \$false, \$true, \$false)

    $sb = New-Object System.Text.StringBuilder
    foreach ($slide in $pres.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                [void]$sb.AppendLine($shape.TextFrame.TextRange.Text)
            }
        }
    }

    $pres.Saved = \$true
    $pres.Close()
    $ppt.Quit()
    Write-Output $sb.ToString()
}
finally {
    try { if ($pres) { $pres.Close() } } catch {}
    try { if ($ppt)  { $ppt.Quit()  } } catch {}
    try {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ppt)  | Out-Null
    } catch {}
}
`
      );
    }

    throw new Error(`unsupported mode: ${mode}`);
  }

  /* ------------------------------------------------------------
   * PDF 抽出 (pdfjs-dist)
   * ---------------------------------------------------------- */
  private static async extractFromPdf(filePath: string): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { getDocument } = pdfjs;

    // ファイルをバイナリで読み込み
    const data = new Uint8Array(readFileSync(filePath));

    // ドキュメントをロード
    const pdf = await getDocument({ data }).promise;

    let result = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const { items } = await page.getTextContent();

      // アイテムを Y（降順）→ X（昇順）でソート
      const textItems = (items as TextItem[]).sort((a, b) => {
        const yA = a.transform[5],
          yB = b.transform[5];
        if (Math.abs(yA - yB) > 0.1) return yB - yA;
        return a.transform[4] - b.transform[4];
      });

      let lastY = Number.NaN;
      let lastX = 0;

      for (const item of textItems) {
        const x = item.transform[4],
          y = item.transform[5];

        // 行が変わったら改行
        if (!isFinite(lastY) || Math.abs(y - lastY) > 2) {
          if (result !== '' && !result.endsWith('\n')) result += '\n';
          lastX = x;
        }

        // 同一行でも X 差が大きければスペース
        const charHeight = Math.sqrt(
          item.transform[2] ** 2 + item.transform[3] ** 2,
        );
        if (x - lastX > charHeight * 0.5) result += ' ';

        result += item.str;
        lastY = y;
        lastX = x + (item.width ?? item.str.length * charHeight);
      }
      result += '\n\n'; // ページ間は空行
    }

    await pdf.destroy();
    return result.trim();
  }

  /* ------------------------------------------------------------
   * 共通エラーヘルパ
   * ---------------------------------------------------------- */
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
