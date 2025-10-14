import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';
import { createHash } from 'crypto';
import { getMainLogger } from './logger';
import { internalError } from './error';
import { getCustomAppDataDir } from '../main';
import { publishEvent } from '../lib/eventPayloadHelper';

const logger = getMainLogger();

/**
 * PDF変換キャッシュのメタデータ型定義
 */
interface PdfCacheMetadata {
  /** 元ファイルのパス */
  filePath: string;
  /** 元ファイル名 */
  fileName: string;
  /** 元ファイルの最終更新時刻 */
  lastModified: number;
  /** 元ファイルのサイズ */
  fileSize: number;
  /** キャッシュされたPDFファイルのパス */
  cachePdfPath: string;
  /** キャッシュ作成日時 */
  cachedAt: number;
}

/**
 * OfficeドキュメントのMIMEタイプ
 */
const OFFICE_MIME_TYPES = {
  WORD_DOC: 'application/msword',
  WORD_DOCX:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  EXCEL_XLS: 'application/vnd.ms-excel',
  EXCEL_XLSX:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  POWERPOINT_PPT: 'application/vnd.ms-powerpoint',
  POWERPOINT_PPTX:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

/**
 * Office ドキュメントタイプ
 */
type OfficeDocumentType = 'Word' | 'Excel' | 'PowerPoint';

/**
 * MIMEタイプからOfficeドキュメントタイプを判定
 */
function getDocumentTypeFromMimeType(mimeType: string): OfficeDocumentType {
  switch (mimeType) {
    case OFFICE_MIME_TYPES.WORD_DOC:
    case OFFICE_MIME_TYPES.WORD_DOCX:
      return 'Word';
    case OFFICE_MIME_TYPES.EXCEL_XLS:
    case OFFICE_MIME_TYPES.EXCEL_XLSX:
      return 'Excel';
    case OFFICE_MIME_TYPES.POWERPOINT_PPT:
    case OFFICE_MIME_TYPES.POWERPOINT_PPTX:
      return 'PowerPoint';
    default:
      throw internalError({
        expose: true,
        messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
        messageParams: {
          detail: `変換対象外のファイルを検知しました: ${mimeType}`,
        },
      });
  }
}

/**
 * ファイルパスからMIMEタイプを取得
 */
function getMimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.doc': OFFICE_MIME_TYPES.WORD_DOC,
    '.docx': OFFICE_MIME_TYPES.WORD_DOCX,
    '.xls': OFFICE_MIME_TYPES.EXCEL_XLS,
    '.xlsx': OFFICE_MIME_TYPES.EXCEL_XLSX,
    '.ppt': OFFICE_MIME_TYPES.POWERPOINT_PPT,
    '.pptx': OFFICE_MIME_TYPES.POWERPOINT_PPTX,
  };
  return mimeTypes[ext] || '';
}

/**
 * Office ドキュメントが画像化対象かどうかを判定
 */
export function isOfficeDocument(mimeType: string): boolean {
  return Object.values(OFFICE_MIME_TYPES).includes(
    mimeType as (typeof OFFICE_MIME_TYPES)[keyof typeof OFFICE_MIME_TYPES],
  );
}

/**
 * キャッシュディレクトリのパスを取得
 */
function getCacheDir(): string {
  const userDataPath = getCustomAppDataDir();
  const cacheDir = path.join(userDataPath, 'pdf_caches');

  // ディレクトリが存在しない場合は作成
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  return cacheDir;
}

/**
 * キャッシュメタデータファイルのパスを生成
 */
function getCacheMetadataPath(filePath: string): string {
  const hash = createHash('md5').update(filePath).digest('hex');
  return path.join(getCacheDir(), `${hash}.json`);
}

/**
 * キャッシュPDFファイルのパスを生成
 */
function getCachePdfPath(filePath: string): string {
  const hash = createHash('md5').update(filePath).digest('hex');
  return path.join(getCacheDir(), `${hash}.pdf`);
}

/**
 * キャッシュからPDFファイルパスを読み込み
 * ファイルが更新されている場合はnullを返す
 */
async function tryReadCache(filePath: string): Promise<string | null> {
  try {
    const metadataPath = getCacheMetadataPath(filePath);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: PdfCacheMetadata = JSON.parse(metadataContent);

    // ファイルの現在の情報を取得
    const stats = await fs.stat(filePath);

    // ファイルが更新されている場合はキャッシュを無効とする
    if (stats.mtimeMs !== metadata.lastModified) {
      logger.debug(
        { filePath, metadataPath },
        'ファイルが更新されているためキャッシュを無効化します',
      );
      await deleteCache(filePath);
      return null;
    }

    // キャッシュされたPDFファイルの存在確認
    try {
      await fs.access(metadata.cachePdfPath);
      return metadata.cachePdfPath;
    } catch {
      // PDFファイルが存在しない場合はメタデータも削除
      logger.debug(
        { filePath, cachePdfPath: metadata.cachePdfPath },
        'キャッシュPDFファイルが存在しないため無効化します',
      );
      await deleteCache(filePath);
      return null;
    }
  } catch (error) {
    // ファイルが存在しない場合やJSONパースエラーの場合は null を返す
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error({ error, filePath }, 'キャッシュの読み込みに失敗しました');
    }
    return null;
  }
}

/**
 * 変換後PDFをキャッシュに保存
 */
async function saveCache(
  originalFilePath: string,
  pdfPath: string,
  stats: { mtimeMs: number; size: number },
): Promise<void> {
  try {
    const cachePdfPath = getCachePdfPath(originalFilePath);
    const metadataPath = getCacheMetadataPath(originalFilePath);

    // PDFファイルをキャッシュディレクトリにコピー
    await fs.copyFile(pdfPath, cachePdfPath);

    // メタデータを保存
    const metadata: PdfCacheMetadata = {
      filePath: originalFilePath,
      fileName: path.basename(originalFilePath),
      lastModified: stats.mtimeMs,
      fileSize: stats.size,
      cachePdfPath,
      cachedAt: Date.now(),
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    logger.debug({ originalFilePath, cachePdfPath }, 'PDFキャッシュを保存しました');
  } catch (error) {
    // キャッシュが保存できない場合は大きな問題にならないのでエラーは握りつぶす
    logger.error({ error, originalFilePath }, 'キャッシュの保存に失敗しました');
  }
}

/**
 * キャッシュを削除
 */
async function deleteCache(filePath: string): Promise<void> {
  try {
    const metadataPath = getCacheMetadataPath(filePath);
    const cachePdfPath = getCachePdfPath(filePath);

    // メタデータファイルを削除
    await fs.unlink(metadataPath).catch(() => void 0);
    // PDFファイルを削除
    await fs.unlink(cachePdfPath).catch(() => void 0);
  } catch (error) {
    // キャッシュが削除できない場合は大きな問題にならないのでエラーは握りつぶす
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error(error, 'キャッシュの削除に失敗しました');
    }
  }
}

/**
 * PowerShellスクリプトを生成（Office→PDF変換用）
 */
function buildPsScriptForPdfConversion(
  documentType: OfficeDocumentType,
  inputPath: string,
  outputPath: string,
): string {
  // パス中のシングルクォートは二重にしてエスケープ
  const safeInputPath = inputPath.replace(/'/g, "''");
  const safeOutputPath = outputPath.replace(/'/g, "''");

  const commonHeader = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$InputPath = '${safeInputPath}'
$OutputPath = '${safeOutputPath}'
`;

  switch (documentType) {
    case 'Word':
      return (
        commonHeader +
        `
try {
    # Word Application を作成
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0  # wdAlertsNone

    try {
        # ドキュメントを開く（ReadOnly）
        $doc = $word.Documents.Open($InputPath, $false, $true)

        # ページ設定（A4サイズ）
        # $doc.PageSetup.PaperSize = 9  # wdPaperA4

        # PDF として保存 (wdFormatPDF = 17)
        $doc.SaveAs([ref]$OutputPath, [ref]17)
        $doc.Close($false)

        Write-Output "SUCCESS: Word document converted to PDF"
    }
    finally {
        $word.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
catch {
    Write-Error "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
`
      );

    case 'Excel':
      return (
        commonHeader +
        `
try {
    # Excel Application を作成
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    try {
        # ワークブックを開く（ReadOnly）
        $workbook = $excel.Workbooks.Open($InputPath, $null, $true)

        $MARGIN_IN  = 0.15
        $HEADER_IN  = 0.0
        $FOOTER_IN  = 0.0

        # A4 サイズ（インチ）
        $A4WidthIn  = 8.27
        $A4HeightIn = 11.69

        # points 換算（1inch = 72pt）
        $A4WidthPtPortrait  = $excel.InchesToPoints($A4WidthIn)
        $A4HeightPtPortrait = $excel.InchesToPoints($A4HeightIn)
        $A4WidthPtLandscape  = $A4HeightPtPortrait
        $A4HeightPtLandscape = $A4WidthPtPortrait

        # 余白を points に
        $MARGIN_PT = $excel.InchesToPoints($MARGIN_IN)
        $HEADER_PT = $excel.InchesToPoints($HEADER_IN)
        $FOOTER_PT = $excel.InchesToPoints($FOOTER_IN)

        function GetScale([double]$cw, [double]$ch, [double]$pw, [double]$ph) {
          if ($cw -le 0 -or $ch -le 0 -or $pw -le 0 -or $ph -le 0) { return 0.0 }
          $scaleX = $pw / $cw
          $scaleY = $ph / $ch
          $s = [Math]::Min($scaleX, $scaleY)
          if ($s -gt 1.0) { return 1.0 } else { return $s }
        }

        # 総シート数を取得
        $totalSheets = 0
        foreach ($ws in $workbook.Worksheets) {
          if ($ws.Type -eq [Microsoft.Office.Interop.Excel.XlSheetType]::xlWorksheet.value__) {
            $totalSheets++
          }
        }

        $currentSheet = 0
        foreach ($worksheet in $workbook.Worksheets) {
          try {
            # ワークシートのみ対象（Chart等はスキップ）
            if ($worksheet.Type -ne [Microsoft.Office.Interop.Excel.XlSheetType]::xlWorksheet.value__) { continue }

            $currentSheet++
            # 進捗情報を出力
            Write-Output ("PROGRESS:SHEET_SETUP:{0}:{1}:{2}" -f $worksheet.Name, $currentSheet, $totalSheets)

            $ps = $worksheet.PageSetup

            # まず余白を極小に設定（向き判定に効くため先に設定）
            $ps.LeftMargin   = $MARGIN_PT
            $ps.RightMargin  = $MARGIN_PT
            $ps.TopMargin    = $MARGIN_PT
            $ps.BottomMargin = $MARGIN_PT
            $ps.HeaderMargin = $HEADER_PT
            $ps.FooterMargin = $FOOTER_PT

            # ヘッダ/フッタ文字が残っていると有効領域を圧迫するので必要なら消す
            $ps.LeftHeader   = ""
            $ps.CenterHeader = ""
            $ps.RightHeader  = ""
            $ps.LeftFooter   = ""
            $ps.CenterFooter = ""
            $ps.RightFooter  = ""

            # 用紙はA4
            $ps.PaperSize = 9  # xlPaperA4

            # UsedRange から実寸を取得
            $used = $worksheet.UsedRange
            if ($used -eq $null) { continue }
            $contentWidthPt  = [double]$used.Width
            $contentHeightPt = [double]$used.Height

            # 印刷可能領域（現在設定の余白で計算）
            $printableWidthPortrait  = $A4WidthPtPortrait  - $ps.LeftMargin - $ps.RightMargin
            $printableHeightPortrait = $A4HeightPtPortrait - $ps.TopMargin  - $ps.BottomMargin - $ps.HeaderMargin - $ps.FooterMargin

            $printableWidthLandscape  = $A4WidthPtLandscape  - $ps.LeftMargin - $ps.RightMargin
            $printableHeightLandscape = $A4HeightPtLandscape - $ps.TopMargin  - $ps.BottomMargin - $ps.HeaderMargin - $ps.FooterMargin

            $scalePortrait  = GetScale $contentWidthPt $contentHeightPt $printableWidthPortrait  $printableHeightPortrait
            $scaleLandscape = GetScale $contentWidthPt $contentHeightPt $printableWidthLandscape $printableHeightLandscape

            # 縮小率が大きい方（= より大きく出せる方）を選択
            if ($scaleLandscape -gt $scalePortrait) {
              $ps.Orientation = 2  # xlLandscape
            } else {
              $ps.Orientation = 1  # xlPortrait
            }

            # 印刷範囲を UsedRange に強制（既存のPrintAreaを使いたい場合はコメントアウト）
            # $ps.PrintArea = $used.Address($false, $false)

            # 1シート=1ページ
            $ps.Zoom = $false
            $ps.FitToPagesWide = 1
            $ps.FitToPagesTall = 5

            # 視覚的安定のため（任意）
            $ps.CenterHorizontally = $true
            $ps.CenterVertically   = $false
          }
          catch {
            Write-Verbose "Skip on sheet '$($worksheet.Name)': $($_.Exception.Message)"
          }
          finally {
            if ($used) { [Runtime.InteropServices.Marshal]::ReleaseComObject($used) | Out-Null }
            $used = $null
          }
        }

        # PDFエクスポート開始を通知
        Write-Output "PROGRESS:PDF_EXPORT"

        # PDF として保存 (xlTypePDF = 0)
        $workbook.ExportAsFixedFormat(
            0,  # Type: xlTypePDF
            $OutputPath
            # 0,  # Quality: xlQualityStandard
            # $true,  # IncludeDocProperties
            # $false,  # IgnorePrintAreas
            # $null,  # From (null = all)
            # $null,  # To (null = all)
            # $false  # OpenAfterPublish
        )

        $workbook.Close($false)
        $excel.Quit()

        Write-Output "SUCCESS: Excel workbook converted to PDF"
    }
    finally {
        try { if ($workbook) { $workbook.Close(\$false) } } catch {}
        try { if ($excel) { $excel.Quit()     } } catch {}
        if ($workbook) { [Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
        if ($excel)    { [Runtime.InteropServices.Marshal]::ReleaseComObject($excel)    | Out-Null }
        $workbook = $null
        $excel    = $null
    }
}
catch {
    Write-Error "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
`
      );

    case 'PowerPoint':
      return (
        commonHeader +
        `
try {
    # PowerPoint Application を作成
    $powerpoint = New-Object -ComObject PowerPoint.Application

    try {
        # プレゼンテーションを開く（ReadOnly）
        $presentation = $powerpoint.Presentations.Open(
            $InputPath,
            [Microsoft.Office.Core.MsoTriState]::msoTrue,  # ReadOnly
            [Microsoft.Office.Core.MsoTriState]::msoFalse,  # Untitled
            [Microsoft.Office.Core.MsoTriState]::msoFalse   # WithWindow
        )

        # PDF として保存 (ppSaveAsPDF = 32)
        $presentation.SaveAs($OutputPath, 32)
        $presentation.Close()

        Write-Output "SUCCESS: PowerPoint presentation converted to PDF"
    }
    finally {
        $powerpoint.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($powerpoint) | Out-Null
    }
}
catch {
    Write-Error "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
`
      );

    default:
      throw internalError({
        expose: true,
        messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
        messageParams: {
          detail: `変換対象外のファイルを検知しました: ${documentType}`,
        },
      });
  }
}

/**
 * Office ドキュメントを PDF に変換
 *
 * @param inputPath 入力ファイルのパス
 * @returns 変換後の PDF ファイルのパス（キャッシュまたは一時ファイル）
 */
export async function convertOfficeToPdf(inputPath: string): Promise<string> {
  // プラットフォームチェック（Windowsのみ対応）
  if (process.platform !== 'win32') {
    throw internalError({
      expose: true,
      messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
      messageParams: { detail: 'windows環境でのみサポートされています' },
    });
  }

  // ファイルの存在確認と情報取得
  let stats;
  try {
    stats = await fs.stat(inputPath);
  } catch (error) {
    throw internalError({
      expose: true,
      messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
      messageParams: { detail: `ファイルが存在しません: ${inputPath}` },
      cause: error,
    });
  }

  // MIMEタイプからドキュメントタイプを判定
  const mimeType = getMimeTypeFromPath(inputPath);
  if (!mimeType || !isOfficeDocument(mimeType)) {
    throw internalError({
      expose: true,
      messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
      messageParams: {
        detail: `変換対象外のファイルを検知しました: ${mimeType}`,
      },
    });
  }

  // キャッシュをチェック
  const cachedPdfPath = await tryReadCache(inputPath);
  if (cachedPdfPath) {
    logger.info({ inputPath, cachedPdfPath }, 'Using cached PDF');
    return cachedPdfPath;
  }

  const documentType = getDocumentTypeFromMimeType(mimeType);

  // 一時出力ファイルパスを生成
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const outputPath = path.join(
    tmpDir,
    `office_converted_${timestamp}_${randomStr}.pdf`,
  );

  // PowerShellスクリプトを生成
  const psScript = buildPsScriptForPdfConversion(
    documentType,
    inputPath,
    outputPath,
  );

  // 一時スクリプトファイルを作成
  const tmpScriptPath = path.join(
    tmpDir,
    `office_convert_${timestamp}_${randomStr}.ps1`,
  );

  logger.info(
    { inputPath, documentType, outputPath },
    'Converting Office document to PDF',
  );

  try {
    // UTF-8 with BOM で書き込む（fileExtractor.tsと同じ）
    await fs.writeFile(tmpScriptPath, '\uFEFF' + psScript, {
      encoding: 'utf8',
    });

    // PowerShellスクリプトをspawnで実行（リアルタイム出力取得のため）
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        tmpScriptPath,
      ]);

      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stdoutBuffer += text;

        // 進捗情報をパース
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('PROGRESS:')) {
            const parts = trimmed.substring('PROGRESS:'.length).split(':');
            const progressType = parts[0];

            if (progressType === 'SHEET_SETUP' && parts.length >= 4) {
              const sheetName = parts[1];
              const currentSheet = parseInt(parts[2], 10);
              const totalSheets = parseInt(parts[3], 10);

              // 進捗イベントをpublish
              publishEvent(
                'fs-convert-office-to-pdf-progress' as any,
                {
                  fileName: path.basename(inputPath),
                  progressType: 'sheet-setup',
                  sheetName,
                  currentSheet,
                  totalSheets,
                } as any,
              );
            } else if (progressType === 'PDF_EXPORT') {
              // PDFエクスポート開始イベントをpublish
              publishEvent(
                'fs-convert-office-to-pdf-progress' as any,
                {
                  fileName: path.basename(inputPath),
                  progressType: 'pdf-export',
                } as any,
              );
            }
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        stderrBuffer += data.toString('utf8');
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      child.on('close', (code: number | null) => {
        // スクリプトからの出力をログに記録
        if (stdoutBuffer) {
          logger.debug({ stdout: stdoutBuffer }, 'PowerShell stdout');
        }
        if (stderrBuffer) {
          logger.warn({ stderr: stderrBuffer }, 'PowerShell stderr');
        }

        if (code !== 0) {
          reject(
            new Error(
              `PowerShell script exited with code ${code}: ${stderrBuffer}`,
            ),
          );
        } else {
          resolve();
        }
      });
    });

    // 出力ファイルの存在確認
    try {
      await fs.access(outputPath);
    } catch (error) {
      throw internalError({
        expose: true,
        messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
        messageParams: { detail: 'PDF変換に失敗しました' },
        cause: error,
      });
    }

    logger.info({ outputPath }, 'Successfully converted to PDF');

    // 変換後PDFをキャッシュに保存
    await saveCache(inputPath, outputPath, stats);

    // 一時PDFファイルを削除（キャッシュに保存済みのため）
    await fs.unlink(outputPath).catch(() => void 0);

    // キャッシュされたPDFのパスを返す
    const cachedPdfPath = getCachePdfPath(inputPath);
    return cachedPdfPath;
  } catch (error: any) {
    logger.error({ error, inputPath }, 'Office to PDF conversion error');

    // エラーメッセージを解析
    let errorMessage = 'Failed to convert Office document to PDF';
    if (error.message) {
      if (
        error.message.includes('Microsoft.Office') ||
        error.message.includes('Word.Application') ||
        error.message.includes('Excel.Application') ||
        error.message.includes('PowerPoint.Application')
      ) {
        errorMessage = `Microsoft ${documentType} is not installed or not properly configured.`;
      } else {
        errorMessage = `PDF変換に失敗しました: ${error.message}`;
      }
    }

    throw internalError({
      expose: true,
      messageCode: 'FS_CONVERT_OFFICE_TO_PDF_ERROR',
      messageParams: { detail: errorMessage },
      cause: error,
    });
  } finally {
    // 一時スクリプトファイルのクリーンアップ（fileExtractor.tsと同じ）
    await fs.unlink(tmpScriptPath).catch(() => void 0);
  }
}

/**
 * 一時PDFファイルを削除
 *
 * @param pdfPath 削除する PDF ファイルのパス
 */
export async function cleanupTempPdf(pdfPath: string): Promise<void> {
  try {
    await fs.unlink(pdfPath);
    logger.debug({ pdfPath }, 'Cleaned up temporary PDF');
  } catch (error) {
    logger.warn({ error, pdfPath }, 'Failed to cleanup temporary PDF');
  }
}

/**
 * キャッシュディレクトリをクリーニングする
 * - 元ファイルが存在しないキャッシュファイルを削除
 * - ファイル更新日時が古いキャッシュファイルを削除
 * - 不正なJSONキャッシュファイルを削除
 * - 孤立したPDFファイル（メタデータがないもの）を削除
 */
export async function cleanCacheDirectory(): Promise<void> {
  try {
    const cacheDir = getCacheDir();
    const cacheFiles = await fs.readdir(cacheDir);

    logger.info(`PDFキャッシュディレクトリのクリーニングを開始: ${cacheDir}`);

    let deletedCount = 0;
    const processedHashes = new Set<string>();

    for (const fileName of cacheFiles) {
      const cacheFilePath = path.join(cacheDir, fileName);

      try {
        // .jsonファイル（メタデータ）を処理
        if (fileName.endsWith('.json')) {
          const hash = fileName.replace('.json', '');
          processedHashes.add(hash);

          // JSONメタデータファイルの内容を読み取り
          const metadataContent = await fs.readFile(cacheFilePath, 'utf-8');
          const metadata: PdfCacheMetadata = JSON.parse(metadataContent);

          // 元ファイルの存在確認
          const originalFilePath = metadata.filePath;

          try {
            const stats = await fs.stat(originalFilePath);

            // ファイル更新日時が異なる場合は削除
            if (stats.mtimeMs !== metadata.lastModified) {
              await fs.unlink(cacheFilePath);
              // 対応するPDFファイルも削除
              await fs.unlink(metadata.cachePdfPath).catch(() => void 0);
              deletedCount++;
              logger.debug(
                `ファイル更新日時が古いキャッシュを削除: ${fileName}`,
              );
            }
          } catch (statError) {
            // 元ファイルが存在しない場合は削除
            if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
              await fs.unlink(cacheFilePath);
              // 対応するPDFファイルも削除
              await fs.unlink(metadata.cachePdfPath).catch(() => void 0);
              deletedCount++;
              logger.debug(`元ファイルが存在しないキャッシュを削除: ${fileName}`);
            }
          }
        }
      } catch (processError) {
        // JSONパースエラーなど、不正なキャッシュファイルは削除
        try {
          await fs.unlink(cacheFilePath);
          deletedCount++;
          logger.debug(`不正なキャッシュファイルを削除: ${fileName}`);
        } catch (unlinkError) {
          logger.error(
            { error: unlinkError, fileName },
            'キャッシュファイルの削除に失敗',
          );
        }
      }
    }

    // 孤立したPDFファイル（メタデータがないもの）を削除
    for (const fileName of cacheFiles) {
      if (fileName.endsWith('.pdf')) {
        const hash = fileName.replace('.pdf', '');
        if (!processedHashes.has(hash)) {
          const pdfFilePath = path.join(cacheDir, fileName);
          try {
            await fs.unlink(pdfFilePath);
            deletedCount++;
            logger.debug(`孤立したPDFファイルを削除: ${fileName}`);
          } catch (unlinkError) {
            logger.error(
              { error: unlinkError, fileName },
              '孤立PDFファイルの削除に失敗',
            );
          }
        }
      }
    }

    logger.info(
      `PDFキャッシュクリーニング完了: ${deletedCount}個のファイルを削除`,
    );
  } catch (error) {
    logger.error(
      { error },
      'PDFキャッシュディレクトリのクリーニングに失敗しました',
    );
  }
}
