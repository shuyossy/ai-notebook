import type { TextExtractionFormatType } from '@/types/review';

/**
 * フォーマット説明が意味を持つリッチフォーマットの集合
 * プレーンフォーマットのみの場合はフォーマットコンテキストを生成しない（トークン節約）
 */
const RICH_FORMAT_TYPES: ReadonlySet<string> = new Set([
  'xlsx-csv-v1',
  'xlsx-rich-v1',
  'docx-rich-v1',
  'pptx-rich-v1',
  'pdf-rich-v1',
  'image-pages',
]);

/**
 * フォーマット非開示指示（全ファイル共通）
 */
const FORMAT_NON_DISCLOSURE_INSTRUCTION = `
CRITICAL INSTRUCTION - FORMAT NON-DISCLOSURE:
The formatting conventions described above are internal system representations.
You MUST NOT reference, mention, or describe any of these conventions in your output.
Write your response as if you are directly viewing the original files.
Never use terms like "image link", "shape tag", "shape_N", "connector_N",
"#sheet:", "#slide:", "#page:", "[row:N]", "pos:", "size:", "cell:", "CSV format", "referenceId",
"![image", or any other internal formatting terminology in your response.
Treat the content as if no format conversion has taken place.
`.trim();

/**
 * フォーマット識別子ごとの説明を取得する
 * @param formatType テキスト抽出フォーマット識別子
 * @param includeImages テキスト抽出時にファイル内画像を含めるか（デフォルト: false）
 * @returns フォーマット説明文字列
 */
export function getFormatDescription(
  formatType: TextExtractionFormatType,
  includeImages: boolean = false,
): string {
  switch (formatType) {
    case 'txt-plain':
      return 'Plain text content with no conversion applied.';

    case 'csv-plain':
      return 'CSV file content read as plain text.';

    case 'md-plain':
      return 'Markdown file content read as plain text.';

    case 'xlsx-csv-v1':
      return [
        'Excel spreadsheet content represented in the following format:',
        '- Each sheet is separated by a header line: #sheet:<SheetName>',
        '- Cell contents within each sheet are represented in CSV (comma-separated) format.',
      ].join('\n');

    case 'xlsx-rich-v1': {
      const xlsxLines = [
        'Excel spreadsheet content represented in the following format:',
        '- Each sheet is separated by a header line: #sheet:<SheetName>',
        '- Non-empty rows are prefixed with a row marker: [row:N] (N is the 1-based Excel row number).',
        '- Cell contents within each sheet are represented in CSV (comma-separated, RFC 4180) format.',
        '  Cells containing commas, double quotes, or line breaks are enclosed in double quotes.',
        '  Line breaks within quoted cells are preserved as-is.',
      ];
      if (includeImages) {
        xlsxLines.push(
          '- Embedded images are represented as: ![image at <CellRange>](<referenceId>)',
          '  The actual image data is provided separately with the corresponding referenceId.',
        );
      }
      xlsxLines.push(
        '- Shapes are represented as tagged blocks:',
        '  [shape_N:<GeometryType> cell:<CellRange>]',
        '  Text content follows on the same line. For multi-line text, subsequent lines use [shape_N] prefix.',
        '- Connectors are represented as:',
        '  [connector_N:<Type> <endpointA>-><endpointB> cell:<CellRange>]',
        '  Endpoints reference shapes (e.g., shape_1) or cell positions (e.g., A3).',
        '  Arrow notation: -> (one-way), <- (reverse), <-> (bidirectional), -- (no arrow).',
      );
      return xlsxLines.join('\n');
    }

    case 'docx-plain':
      return 'Word document content extracted as plain text without structural information.';

    case 'docx-rich-v1': {
      const docxLines = [
        'Word document content represented in the following format:',
        '- Headings are represented using Markdown header syntax (# through ######).',
        '- Lists are represented using Markdown list syntax (- for unordered, 1. for ordered).',
        '- Tables are represented in CSV format (comma-separated, RFC 4180).',
        '  Cells containing commas, double quotes, or line breaks are enclosed in double quotes.',
        '  Line breaks within quoted cells are preserved as-is.',
      ];
      if (includeImages) {
        docxLines.push(
          '- Embedded images are represented as: ![image](<referenceId>)',
          '  The actual image data is provided separately with the corresponding referenceId.',
        );
      }
      return docxLines.join('\n');
    }

    case 'pptx-plain':
      return 'PowerPoint presentation content extracted as plain text.';

    case 'pptx-rich-v1': {
      const pptxLines = [
        'PowerPoint presentation content represented in the following format:',
        '- Each slide is separated by a header line: #slide:<SlideNumber>',
        '- Shapes are represented as tagged blocks:',
        '  [shape_N:<GeometryType> pos:<X>cm,<Y>cm size:<W>cm,<H>cm]',
        '  Text content follows on the same line. For multi-line text, subsequent lines use [shape_N] prefix.',
        '  Text boxes and placeholders do not have the shape_ prefix.',
        '- Tables are represented in CSV format (comma-separated, RFC 4180).',
        '  Cells containing commas, double quotes, or line breaks are enclosed in double quotes.',
        '  Line breaks within quoted cells are preserved as-is.',
      ];
      if (includeImages) {
        pptxLines.push(
          '- Embedded images are represented as: ![image](<referenceId>)',
          '  The actual image data is provided separately with the corresponding referenceId.',
        );
      }
      pptxLines.push(
        '- Connectors are represented as:',
        '  [connector_N:<Type> <endpointA>-><endpointB> pos:<X>cm,<Y>cm size:<W>cm,<H>cm]',
        '  Arrow notation: -> (one-way), <- (reverse), <-> (bidirectional), -- (no arrow).',
        '- Coordinate and size values are in cm (converted from EMU, 1 cm = 360,000 EMU, rounded to 1 decimal place).',
        '- NOTE: Within each slide, elements appear in category order (tables, images, text, shapes, connectors) — not in spatial order.',
        '  Shapes and connectors have pos/size metadata for inferring spatial layout; tables, images, and text boxes do not.',
      );
      return pptxLines.join('\n');
    }

    case 'pdf-text-v1':
      return 'PDF document content extracted as text.';

    case 'pdf-rich-v1': {
      const pdfLines = [
        'PDF document content represented in the following format:',
        '- Each page is separated by a header line: #page:<PageNumber>',
        '- Text content is presented as extracted from the PDF.',
      ];
      if (includeImages) {
        pdfLines.push(
          '- Embedded images are represented as: ![image](<referenceId>)',
          '  The actual image data is provided separately with the corresponding referenceId.',
        );
      }
      return pdfLines.join('\n');
    }

    case 'image-pages':
      return 'Document pages converted to images. Each page is provided as a separate image.';

    default: {
      // 網羅性チェック: TextExtractionFormatTypeに新しい値を追加した場合、
      // ここでコンパイルエラーが発生するため、対応するフォーマット説明の追加漏れを防止できる
      const _exhaustiveCheck: never = formatType;
      return `Document content in text format. (${_exhaustiveCheck})`;
    }
  }
}

/**
 * ファイル一覧からシステムプロンプト用のフォーマットコンテキスト文字列を構築する
 * ユニークなフォーマット識別子ごとにグループ化し、対応ファイル名を列挙する
 * @param files ファイル一覧（name, formatType, processModeを含む）
 * @returns フォーマットコンテキスト文字列（ファイルがない場合は空文字列）
 */
export function buildDocumentFormatContext(
  files: Array<{
    name: string;
    formatType?: string;
    processMode: string;
    includeImages?: boolean;
  }>,
): string {
  // formatTypeが設定されているファイルのみ対象
  const filesWithFormat = files.filter(
    (f) => f.formatType && f.formatType.length > 0,
  );

  // 画像モードのファイルは"image-pages"として扱う
  const imageFiles = files.filter(
    (f) => f.processMode === 'image' && !f.formatType,
  );
  if (imageFiles.length > 0) {
    filesWithFormat.push(
      ...imageFiles.map((f) => ({
        name: f.name,
        formatType: 'image-pages' as string,
        processMode: f.processMode,
      })),
    );
  }

  if (filesWithFormat.length === 0) {
    return '';
  }

  // リッチフォーマットが1つも含まれない場合はフォーマットコンテキスト不要（トークン節約）
  const hasRichFormat = filesWithFormat.some(
    (f) => f.formatType && RICH_FORMAT_TYPES.has(f.formatType),
  );
  if (!hasRichFormat) {
    return '';
  }

  // フォーマット識別子ごとにグループ化
  // 同グループ内に1つでもincludeImages=trueのファイルがあれば画像ありverの説明を使用
  const groups = new Map<
    string,
    { fileNames: string[]; hasAnyImageIncluded: boolean }
  >();
  for (const file of filesWithFormat) {
    const formatType = file.formatType!;
    const includeImages = file.includeImages ?? false;
    if (!groups.has(formatType)) {
      groups.set(formatType, { fileNames: [], hasAnyImageIncluded: false });
    }
    const group = groups.get(formatType)!;
    group.fileNames.push(file.name);
    if (includeImages) {
      group.hasAnyImageIncluded = true;
    }
  }

  // フォーマット説明を構築
  const sections: string[] = [];
  sections.push('DOCUMENT FORMAT INFORMATION:');
  sections.push(
    'The following documents have been pre-processed and their content is represented in specific formats.',
    'Understanding these formats will help you accurately interpret the document content.',
    '',
  );

  for (const [formatType, { fileNames, hasAnyImageIncluded }] of groups) {
    const description = getFormatDescription(
      formatType as TextExtractionFormatType,
      hasAnyImageIncluded,
    );
    sections.push(`Files: ${fileNames.join(', ')}`);
    sections.push(description);
    sections.push('');
  }

  // フォーマット非開示指示を付加
  sections.push(FORMAT_NON_DISCLOSURE_INSTRUCTION);

  return sections.join('\n');
}
