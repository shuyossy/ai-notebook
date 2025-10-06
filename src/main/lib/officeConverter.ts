import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { getMainLogger } from './logger';
import { internalError } from './error';

const execFileP = promisify(execFile);
const logger = getMainLogger();

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

        foreach ($worksheet in $workbook.Worksheets) {
          try {
            # ワークシートのみ対象（Chart等はスキップ）
            if ($worksheet.Type -ne [Microsoft.Office.Interop.Excel.XlSheetType]::xlWorksheet.value__) { continue }

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
        }

        # PDF として保存 (xlTypePDF = 0)
        $workbook.ExportAsFixedFormat(
            0,  # Type: xlTypePDF
            $OutputPath,
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
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
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
    $powerpoint.Visible = [Microsoft.Office.Core.MsoTriState]::msoFalse

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
 * @returns 変換後の PDF ファイルのパス（一時ファイル）
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

  // ファイルの存在確認
  try {
    await fs.access(inputPath);
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

    // PowerShellスクリプトを実行
    const { stdout, stderr } = await execFileP(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScriptPath],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }, // 10 MiB
    );

    // スクリプトからの出力をログに記録
    if (stdout) {
      logger.debug({ stdout }, 'PowerShell stdout');
    }
    if (stderr) {
      logger.warn({ stderr }, 'PowerShell stderr');
    }

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
    return outputPath;
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
