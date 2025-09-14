/* eslint-disable */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { getCustomAppDataDir } from '../main';

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

/** テキスト後処理ポリシー */
type TextPostProcessPolicy = {
  /** 連続空白（半角/全角/タブ/NBSP）を1つに圧縮 */
  collapseConsecutiveWhitespaces: boolean;
  /** 行頭インデントは保持したまま圧縮 */
  collapsePreserveIndent: boolean;
  /** 行末の空白を削除 */
  trimLineEndSpaces: boolean;
  /**
   * 行末カンマを削除
   * - preserveCsvTrailingEmptyFields=true の場合、CSVの末尾空セルらしき行は温存
   */
  removeTrailingCommas: boolean;
  /** CSV の末尾空セルらしき行は行末カンマを温存する */
  preserveCsvTrailingEmptyFields: boolean;
  /** “空行”連続の最大許容数（例: 2） */
  maxConsecutiveBlankLines: number;
  /**
   * 【追加】カンマと空白のみで構成される行を削除
   * 例: ",,,", " , , , " など（空白は無視）
   * デフォルトは安全側で false
   */
  removeCommaOnlyLines: boolean;
};

/** デフォルト（安全寄り） */
const DEFAULT_POST_PROCESS_POLICY: TextPostProcessPolicy = {
  collapseConsecutiveWhitespaces: true,
  collapsePreserveIndent: true,
  trimLineEndSpaces: true,
  removeTrailingCommas: true,
  preserveCsvTrailingEmptyFields: true,
  maxConsecutiveBlankLines: 2,
  removeCommaOnlyLines: true,
};

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

/** extractText オプション */
type ExtractTextOptions = {
  useCache?: boolean;
  textPostProcess?: Partial<TextPostProcessPolicy>;
};

/** 多様なファイル形式からテキストを抽出するユーティリティクラス */
export default class FileExtractor {
  /**
   * キャッシュディレクトリのパスを取得
   */
  private static getCacheDir(): string {
    const userDataPath = getCustomAppDataDir();
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
    options?: ExtractTextOptions,
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
          content = this.normalizeExtractedText(
            content,
            options?.textPostProcess,
          );
          // 抽出したテキストをキャッシュに保存
          await this.saveCache(filePath, content);
        }
      } else {
        content = await this.extractContentByType(filePath, extension);
        content = this.normalizeExtractedText(
          content,
          options?.textPostProcess,
        );
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

  private static normalizeExtractedText(
    raw: string,
    overrides?: Partial<TextPostProcessPolicy>,
  ): string {
    const policy: TextPostProcessPolicy = {
      ...DEFAULT_POST_PROCESS_POLICY,
      ...(overrides ?? {}),
    };

    // 改行を LF に正規化
    let text = raw.replace(/\r\n?/g, '\n');

    const lines = text.split('\n').map((line) => {
      let current = line;

      // (1) 行末空白削除
      if (policy.trimLineEndSpaces) {
        current = current.replace(/[ \t\u00A0\u3000]+$/u, '');
      }

      // (2) 連続空白の圧縮（行頭インデント保護可）
      if (policy.collapseConsecutiveWhitespaces) {
        if (policy.collapsePreserveIndent) {
          const indentMatch = current.match(/^[ \t\u00A0\u3000]*/u);
          const indent = indentMatch ? indentMatch[0] : '';
          const rest = current.slice(indent.length);
          current = indent + rest.replace(/[ \t\u00A0\u3000]{2,}/gu, ' ');
        } else {
          current = current.replace(/[ \t\u00A0\u3000]{2,}/gu, ' ');
        }
      }

      // (3) カンマのみ行（空白は無視）を削除
      //     例: ",,,", " , , , ", "\t,\t,\t"
      if (policy.removeCommaOnlyLines) {
        const commaOnly = /^[ \t\u00A0\u3000]*(?:,[ \t\u00A0\u3000]*)+$/u; // カンマ+空白のみ（少なくとも1つのカンマ）
        if (commaOnly.test(current)) {
          current = '';
        }
      }

      // (4) 行末カンマの削除（CSV末尾空セルは温存可）
      if (policy.removeTrailingCommas) {
        const endsWithComma = /,+$/.test(current);
        if (endsWithComma) {
          if (policy.preserveCsvTrailingEmptyFields) {
            const hasInnerComma = /,.*,[^,]*$/.test(current); // 末尾以外にもカンマ
            const hasQuote = /"/.test(current);
            const isSheetHeader = current.startsWith('#sheet:');
            if (!(hasInnerComma || hasQuote || isSheetHeader)) {
              current = current.replace(/,+$/u, '');
            }
          } else {
            current = current.replace(/,+$/u, '');
          }
        }
      }

      // (5) 空白のみ行は空行へ
      if (/^[ \t\u00A0\u3000]+$/u.test(current)) {
        current = '';
      }

      return current;
    });

    // (6) 空行の連続を制限
    if (policy.maxConsecutiveBlankLines >= 0) {
      const out: string[] = [];
      let blankRun = 0;
      for (const l of lines) {
        if (l.length === 0) {
          blankRun += 1;
          if (blankRun <= policy.maxConsecutiveBlankLines) out.push('');
        } else {
          blankRun = 0;
          out.push(l);
        }
      }
      return out.join('\n');
    }

    return lines.join('\n');
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
      return stdout
        .replace(/\r\n/g, '\n') // CRLF → LF
        .replace(/\r/g, '\n') // 孤立 CR → LF
        .trimEnd(); // 末尾改行除去
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
        return (
          commonHeader +
          `
try {
    # Word 起動
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0  # ダイアログ抑止

    # 読み取り専用ではなく開く（本文を書き換えるため）
    $doc = $word.Documents.Open($Path, $false, $false)

    # ===== CSV 変換ユーティリティ =====

    function Convert-ToCsvField {
      param([string]$Text, [string]$Delimiter)
      # デリミタ or ダブルクオート or 改行を含むなら引用
      $needsQuote = $Text.Contains($Delimiter) -or
                    $Text.Contains('"') -or
                    ($Text.IndexOf([char]13) -ge 0) -or
                    ($Text.IndexOf([char]10) -ge 0)
      $escaped = $Text -replace '"','""'
      if ($needsQuote) { return '"' + $escaped + '"' } else { return $escaped }
    }

    function Get-CleanCellText {
      param($Cell) # Word.Cell
      # セル末尾の CR(13) + BEL(7) を除去
      $t = $Cell.Range.Text.TrimEnd([char]13,[char]7)
      # セル内の改行は見やすさのため空白 1 個に畳み込み
      $t = [regex]::Replace($t, "(\\r?\\n)+", " ")
      return $t
    }

    function Convert-TableToCsv {
      param($Table, [string]$Delimiter)
      $sb = New-Object System.Text.StringBuilder
      for ($r = 1; $r -le $Table.Rows.Count; $r++) {
        $row = $Table.Rows.Item($r)
        $fields = New-Object System.Collections.Generic.List[string]
        for ($ci = 1; $ci -le $row.Cells.Count; $ci++) {
          $cell = $row.Cells.Item($ci)
          $raw  = Get-CleanCellText -Cell $cell
          $csvF = Convert-ToCsvField -Text $raw -Delimiter $Delimiter
          [void]$fields.Add($csvF)
        }
        [void]$sb.AppendLine([string]::Join(",", $fields))
      }
      # 最終改行を削除（CR/LF を直接指定）
      return $sb.ToString().TrimEnd([char]13, [char]10)
    }

    function Replace-TablesWithCsvInRange {
      param($Range)
      # 逆順処理：置換で Tables コレクションが揺れるのを防ぐ
      $tables = $Range.Tables
      for ($i = $tables.Count; $i -ge 1; $i--) {
        $tbl = $tables.Item($i)
        $csv = Convert-TableToCsv -Table $tbl -Delimiter ","
        # 表の範囲そのものを CSV テキストに置換（元位置に埋め込み）
        $tbl.Range.Text = $csv
      }
    }

    # ===== 本文（メインストーリー）だけを対象に置換 =====
    Replace-TablesWithCsvInRange -Range $doc.Content

    # 置換後の本文テキストを取得（ファイルは保存しない）
    $txt = $doc.Content.Text

    # 出力
    Write-Output $txt
}
finally {
    # 変更は保存せずにクローズ（0 = wdDoNotSaveChanges）
    try { if ($doc)  { $doc.Close(0) } } catch {}
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
