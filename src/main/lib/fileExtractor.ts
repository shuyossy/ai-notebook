/* eslint-disable */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { app } from 'electron';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// pdfテキスト抽出処理において、pdfjs-dist/legacy/build/pdf.mjsを動的インポートする際に、node.js環境でpdf処理をするためにライブラリ内部で@napi-rs/canvasを利用して、ブラウザのcanvasをpolyfillする
// その際、動的にrequire("@napi-rs/canvas")が実行されるが、本番環境だとモジュールが見つけられないエラーになる
// releaseディレクトリに@napi-rs/canvasを追加して解決を試みたが、それでも同様にモジュールが見つけられないエラーが発生するため、予め@napi-rs/canvasを呼び出してpolyfillを実行しておく
import canvas from '@napi-rs/canvas';
import { getMainLogger } from './logger';
import { internalError } from './error';

(globalThis as any).DOMMatrix = canvas.DOMMatrix;
(globalThis as any).ImageData = canvas.ImageData;
(globalThis as any).Path2D = canvas.Path2D;

const execFileP = promisify(execFile);

const logger = getMainLogger();

/** キャッシュ対象となるファイルの拡張子 */
const CACHE_TARGET_EXTENSIONS = [
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.pdf',
];

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

/** 多様なファイル形式からテキストを抽出するユーティリティクラス */
export default class FileExtractor {
  /**
   * キャッシュディレクトリのパスを取得
   */
  private static getCacheDir(): string {
    const userDataPath = app.getPath('userData');
    const cacheDir = path.join(userDataPath, 'document_caches');

    // ディレクトリが存在しない場合は作成
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    return cacheDir;
  }

  /**
   * キャッシュファイルのパスを生成
   */
  private static getCacheFilePath(filePath: string): string {
    const hash = createHash('md5').update(filePath).digest('hex');
    return path.join(this.getCacheDir(), `${hash}.txt`);
  }

  /**
   * 指定されたファイルがキャッシュ対象かどうかを判定
   */
  public static isCacheTarget(filePath: string): boolean {
    try {
      const ext = path.extname(filePath).toLowerCase();
      return CACHE_TARGET_EXTENSIONS.includes(ext);
    } catch (error) {
      logger.error(error, 'ファイルの拡張子の取得に失敗しました');
      return false;
    }
  }

  /**
   * キャッシュを削除
   */
  public static async deleteCache(filePath: string): Promise<void> {
    try {
      const cachePath = this.getCacheFilePath(filePath);
      await fs.unlink(cachePath);
    } catch (error) {
      // キャッシュが削除できない場合は大きな問題にならないのでエラーは握りつぶす
      // ファイルが存在するが、取り出せない場合(≠ENOENT)はログに出す
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(error, 'キャッシュの削除に失敗しました');
      }
    }
  }

  /**
   * キャッシュからテキストを読み込み
   */
  private static async tryReadCache(filePath: string): Promise<string | null> {
    try {
      const cachePath = this.getCacheFilePath(filePath);
      const content = await fs.readFile(cachePath, 'utf-8');
      return content;
    } catch (error) {
      // ファイルが存在しない場合は null を返す
      // ファイルが存在するが、取り出せない場合(≠ENOENT)はログに出す
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ error, filePath }, 'キャッシュの読み込みに失敗しました');
      }
      return null;
    }
  }

  /**
   * テキストをキャッシュに保存
   */
  private static async saveCache(
    filePath: string,
    content: string,
  ): Promise<void> {
    try {
      const cachePath = this.getCacheFilePath(filePath);
      await fs.writeFile(cachePath, content, 'utf-8');
    } catch (error) {
      // キャッシュが保存できない場合は大きな問題にならないのでエラーは握りつぶす
      logger.error({ error, filePath }, 'キャッシュの保存に失敗しました');
    }
  }

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

  /* ------------------------------------------------------------------ */
  /*  パブリック API                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * ファイルパスを受け取り、そのテキストとメタデータを返す
   */
  public static async extractText(
    filePath: string,
    options?: { useCache?: boolean },
  ): Promise<ExtractionResult> {
    const extension = path.extname(filePath).toLowerCase();
    const useCache = options?.useCache ?? true;

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
      let content: string;

      // キャッシュ対象かつキャッシュ使用が有効の場合、キャッシュをチェック
      if (useCache && this.isCacheTarget(filePath)) {
        const cachedContent = await this.tryReadCache(filePath);
        if (cachedContent) {
          content = cachedContent;
        } else {
          content = await this.extractContentByType(filePath, extension);
          // 抽出したテキストをキャッシュに保存
          await this.saveCache(filePath, content);
        }
      } else {
        content = await this.extractContentByType(filePath, extension);
      }

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
      logger.error({ error, filePath }, 'ファイルのテキスト抽出に失敗しました');
      throw internalError({
        expose: true,
        messageCode: 'FILE_TEXT_EXTRACTION_ERROR',
        messageParams: { path: filePath },
        cause: error,
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  拡張子別ハンドラ                                                  */
  /* ------------------------------------------------------------------ */

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

  /** プレーンテキスト */
  private static async extractFromTxt(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      logger.error(
        { error, filePath },
        'テキストファイルの読み込みに失敗しました',
      );
      throw internalError({
        expose: true,
        messageCode: 'FILE_TEXT_EXTRACTION_ERROR',
        messageParams: { path: filePath },
        cause: error,
      });
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
  private static async extractViaPowerShell(
    filePath: string,
    mode: 'word' | 'excel' | 'ppt' | 'pdf',
  ): Promise<string> {
    const psScript = this.buildPsScript(mode, filePath);
    const tmp = path.join(os.tmpdir(), `fx-${mode}-${Date.now()}.ps1`);
    /* ★ UTF-8 with BOM で書き込む ★ */
    await fs.writeFile(tmp, '\uFEFF' + psScript, { encoding: 'utf8' });

    try {
      const { stdout } = await execFileP(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }, // 20 MiB
      );
      return stdout.replace(/\r/g, '\n').trimEnd();
    } finally {
      await fs.unlink(tmp).catch(() => void 0); // 後始末
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
        // case 'pdf': // PDFもword経由で処理できるが、確認ダイアログが出てしまうので、PDFは別途処理する
        return (
          commonHeader +
          `
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
`
        );
      /* ---------------------------- Excel --------------------------- */
      case 'excel':
        return (
          commonHeader +
          `
try {
    $excel               = New-Object -ComObject Excel.Application
    $excel.DisplayAlerts = \$false
    $excel.Visible       = \$false

    $wb = $excel.Workbooks.Open($Path, \$false, \$true)

    $sb = New-Object System.Text.StringBuilder

    foreach ($ws in $wb.Worksheets) {
        #--- シート名を区切りとして出力（任意。不要なら削除） ---
        [void]$sb.AppendLine("#sheet:$($ws.Name)")

        $range = $ws.UsedRange
        $vals  = $range.Value2           # System.Object[,]

        if ($vals) {
            $rowMax = $vals.GetLength(0) # 行数（1 から開始）
            $colMax = $vals.GetLength(1) # 列数

            for ($r = 1; $r -le $rowMax; $r++) {
                $rowBuf = New-Object System.Collections.Generic.List[string]
                for ($c = 1; $c -le $colMax; $c++) {
                    $cell = $vals[$r, $c]
                    $cell = if ($null -eq $cell) { '' } else { [string]$cell }

                    #--- CSV エスケープ ---
                    if ($cell -match '[,"\r\n]') {
                        $cell = '"' + $cell.Replace('"','""') + '"'
                    }
                    $rowBuf.Add($cell)
                }
                # 行を連結して出力
                [void]$sb.AppendLine(($rowBuf -join ','))  # タブ区切りなら '\t'
            }
            [void]$sb.AppendLine()   # シート間を空行で区切る
        }
    }

    $wb.Close(\$false)
    $excel.Quit()

    # 末尾改行を削って返却
    Write-Output $sb.ToString().TrimEnd()
}
finally {
    try { if ($wb)    { $wb.Close(\$false) } } catch {}
    try { if ($excel) { $excel.Quit()     } } catch {}
}
`
        );

      /* --------------------------- PowerPoint ----------------------- */
      case 'ppt':
        return (
          commonHeader +
          `
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open($Path, \$false, \$true, \$false)
    $sb = New-Object System.Text.StringBuilder
    foreach ($slide in $pres.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {    # Shape.HasTextFrame  [oai_citation:4‡Microsoft Learn](https://learn.microsoft.com/ja-jp/office/vba/api/powerpoint.shape.hastextframe?utm_source=chatgpt.com)
                [void]$sb.AppendLine($shape.TextFrame.TextRange.Text)
            }
        }
    }
    $pres.Saved = \$true
    $pres.Close()
    $ppt.Quit()
    Write-Output $sb.ToString()
} finally {
    try { if ($pres) { $pres.Close() } } catch {}
    try { if ($ppt)  { $ppt.Quit() }  } catch {}
}
`
        );

      default:
        throw new Error(`unsupported mode: ${mode}`);
    }
  }

  /**
   * 指定パスの PDF から全ページのテキストを抽出
   */
  private static async extractFromPdf(filePath: string): Promise<string> {
    // PDF.js の ESM モジュールを動的に読み込む
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // 必要な関数とオプションを取得
    const { getDocument } = pdfjs;

    // ファイルをバイナリデータとして読み込む
    const data = new Uint8Array(readFileSync(filePath));

    // ドキュメントをロード
    const loadingTask = getDocument({ data });
    const pdf = await loadingTask.promise;

    let result = '';
    // ページを順に処理
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const { items } = await page.getTextContent();

      // TextItem を Y（逆順）→X 昇順でソート
      const textItems = (items as TextItem[]).sort((a, b) => {
        const yA = a.transform[5],
          yB = b.transform[5];
        if (Math.abs(yA - yB) > 0.1) return yB - yA; // Y 座標が大きい（上）ものを先に
        return a.transform[4] - b.transform[4]; // X 座標で順序
      });

      let lastY = Number.NaN;
      let lastX = 0;
      for (const item of textItems) {
        const x = item.transform[4],
          y = item.transform[5];
        // Y 座標が変わったら改行
        if (!isFinite(lastY) || Math.abs(y - lastY) > 2) {
          if (result !== '' && !result.endsWith('\n')) result += '\n';
          lastX = x;
        }
        // 同一行内でも X 差が文字高さの半分以上ならスペース
        const charHeight = Math.sqrt(
          item.transform[2] ** 2 + item.transform[3] ** 2,
        );
        if (x - lastX > charHeight * 0.5) {
          result += ' ';
        }
        result += item.str;
        lastY = y;
        lastX = x + (item.width ?? item.str.length * charHeight);
      }
      result += '\n\n'; // ページ間は空行
    }

    await pdf.destroy();
    return result.trim();
  }
}
