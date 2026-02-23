/* eslint-disable no-useless-escape, no-irregular-whitespace */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { getMainLogger } from '../logger';

const execFileP = promisify(execFile);

const logger = getMainLogger();

/** テキスト後処理ポリシー */
export type TextPostProcessPolicy = {
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
  /** "空行"連続の最大許容数（例: 2） */
  maxConsecutiveBlankLines: number;
  /**
   * カンマと空白のみで構成される行を削除
   * 例: ",,,", " , , , " など（空白は無視）
   * デフォルトは安全側で false
   */
  removeCommaOnlyLines: boolean;
};

/** デフォルト（安全寄り） */
export const DEFAULT_POST_PROCESS_POLICY: TextPostProcessPolicy = {
  collapseConsecutiveWhitespaces: true,
  collapsePreserveIndent: true,
  trimLineEndSpaces: true,
  removeTrailingCommas: true,
  preserveCsvTrailingEmptyFields: false,
  maxConsecutiveBlankLines: 2,
  removeCommaOnlyLines: true,
};

/**
 * 抽出テキストの正規化処理
 */
export function normalizeExtractedText(
  raw: string,
  overrides?: Partial<TextPostProcessPolicy>,
): string {
  const policy: TextPostProcessPolicy = {
    ...DEFAULT_POST_PROCESS_POLICY,
    ...(overrides ?? {}),
  };

  // 改行を LF に正規化
  let text = raw.replace(/\r\n?/g, '\n');

  // 制御文字を除去
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  const lines = text.split('\n').map((line) => {
    let current = line;

    // (1) 行末空白削除
    if (policy.trimLineEndSpaces) {
      current = current.replace(/(?:\p{White_Space}|\p{Cf})+$/gu, '');
    }

    // (2) 連続空白の圧縮（行頭インデント保護可）
    const SPACE_RUN = /[\p{Zs}\t\f\v]{2,}/gu;
    if (policy.collapseConsecutiveWhitespaces) {
      if (policy.collapsePreserveIndent) {
        const indentMatch = current.match(/^[\p{Zs}\t\f\v]*/u);
        const indent = indentMatch ? indentMatch[0] : '';
        const rest = current.slice(indent.length);
        current = indent + rest.replace(SPACE_RUN, ' ');
      } else {
        current = current.replace(SPACE_RUN, ' ');
      }
    }

    // (3) カンマのみ行（空白は無視）を削除
    if (policy.removeCommaOnlyLines) {
      const commaOnly =
        /^[\p{White_Space}\p{Cf}]*(?:,[\p{White_Space}\p{Cf}]*)+$/u;
      if (commaOnly.test(current)) {
        current = '';
      }
    }

    // (4) 行末カンマの削除（CSV末尾空セルは温存可）
    if (policy.removeTrailingCommas) {
      const endsWithComma = /,+$/.test(current);
      if (endsWithComma) {
        if (policy.preserveCsvTrailingEmptyFields) {
          const hasInnerComma = /,.*,[^,]*$/.test(current);
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
    if (/^[\p{White_Space}\p{Cf}]+$/u.test(current)) {
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

/**
 * プレーンテキストファイルの読み込み
 */
export async function extractFromTxt(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Office COM を PowerShell で呼び出してテキストを取得
 */
export async function extractViaPowerShell(
  filePath: string,
  mode: 'word' | 'excel' | 'ppt',
): Promise<string> {
  const psScript = buildPsScript(mode, filePath);
  const tmp = path.join(os.tmpdir(), `fx-${mode}-${Date.now()}.ps1`);
  /* UTF-8 with BOM で書き込む */
  await fs.writeFile(tmp, '\uFEFF' + psScript, { encoding: 'utf8' });

  try {
    const { stdout } = await execFileP(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },
    );
    return stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  } finally {
    await fs.unlink(tmp).catch(() => void 0);
  }
}

/**
 * モード別に PowerShell スクリプト文字列を生成
 */
export function buildPsScript(mode: string, filePath: string): string {
  const safePath = filePath.replace(/'/g, "''");

  const commonHeader = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$Path = '${safePath}'
`;

  switch (mode) {
    case 'word':
      return (
        commonHeader +
        `
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($Path, $false, $false)

    function Convert-ToCsvField {
      param([string]$Text, [string]$Delimiter)
      $needsQuote = $Text.Contains($Delimiter) -or
                    $Text.Contains('"') -or
                    ($Text.IndexOf([char]13) -ge 0) -or
                    ($Text.IndexOf([char]10) -ge 0)
      $escaped = $Text -replace '"','""'
      if ($needsQuote) { return '"' + $escaped + '"' } else { return $escaped }
    }

    function Convert-TableToCsv-FromRangeText {
      param($Table, [string]$Delimiter)
      $s = $Table.Range.Text
      $CELL_PAIR     = [string]([char]13) + [char]7
      $CELL_REGEX    = [regex]::Escape($CELL_PAIR)
      $ROW_REGEX     = "({0}){{2,}}" -f $CELL_REGEX
      $PLACE_CELL    = '<<__CELL__>>'
      $PLACE_ROW     = '<<__ROW__>>'

      $s = [regex]::Replace($s, $ROW_REGEX,  $PLACE_ROW)
      $s = [regex]::Replace($s, $CELL_REGEX, $PLACE_CELL)
      $s = $s.Replace([char]13,' ').Replace([char]10,' ')

      $sb = New-Object System.Text.StringBuilder
      foreach ($line in ($s -split [regex]::Escape($PLACE_ROW))) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $rawFields = $line -split [regex]::Escape($PLACE_CELL)

        $fields = New-Object System.Collections.Generic.List[string]
        foreach ($f in $rawFields) {
          $clean = ($f).Trim()
          [void]$fields.Add( (Convert-ToCsvField -Text $clean -Delimiter $Delimiter) )
        }

        [void]$sb.AppendLine([string]::Join($Delimiter, $fields))
      }

      return $sb.ToString().TrimEnd([char]13, [char]10)
    }

    function Replace-TablesWithCsvInRange {
      param($Range)
      $tables = $Range.Tables
      for ($i = $tables.Count; $i -ge 1; $i--) {
        $tbl = $tables.Item($i)
        $csv = Convert-TableToCsv-FromRangeText -Table $tbl -Delimiter ","
        $tbl.Range.Text = $csv
      }
    }

    Replace-TablesWithCsvInRange -Range $doc.Content

    $txt = $doc.Content.Text
    Write-Output $txt
}
finally {
    try { if ($doc)  { $doc.Close(0) } } catch {}
    try { if ($word) { $word.Quit()   } } catch {}
}
`
      );

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
        [void]$sb.AppendLine("#sheet:$($ws.Name)")

        $range = $ws.UsedRange
        $vals  = $range.Value2

        if ($vals) {
            $rowMax = $vals.GetLength(0)
            $colMax = $vals.GetLength(1)

            for ($r = 1; $r -le $rowMax; $r++) {
                $rowBuf = New-Object System.Collections.Generic.List[string]
                for ($c = 1; $c -le $colMax; $c++) {
                    $cell = $vals[$r, $c]
                    $cell = if ($null -eq $cell) { '' } else { [string]$cell }

                    if ($cell -match '[,"\r\n]') {
                        $cell = '"' + $cell.Replace('"','""') + '"'
                    }
                    $rowBuf.Add($cell)
                }
                [void]$sb.AppendLine(($rowBuf -join ','))
            }
            [void]$sb.AppendLine()
        }
    }

    $wb.Close(\$false)
    $excel.Quit()

    Write-Output $sb.ToString().TrimEnd()
}
finally {
    try { if ($wb)    { $wb.Close(\$false) } } catch {}
    try { if ($excel) { $excel.Quit()     } } catch {}
}
`
      );

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
            if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
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
 * PDFからテキストを抽出（pdfjs-dist使用）
 */
export async function extractFromPdf(filePath: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = pdfjs;

  const data = new Uint8Array(readFileSync(filePath));
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;

  let result = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();

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
      if (!isFinite(lastY) || Math.abs(y - lastY) > 2) {
        if (result !== '' && !result.endsWith('\n')) result += '\n';
        lastX = x;
      }
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
    result += '\n\n';
  }

  await pdf.destroy();
  return result.trim();
}
