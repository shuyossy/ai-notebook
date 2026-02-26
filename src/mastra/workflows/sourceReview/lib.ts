import { format } from 'date-fns';
import { UploadFile, ExtractedImage } from '@/types';
import { FileTextExtractor } from '@/main/lib/textExtractor/FileTextExtractor';
import { removeImageLinks } from '@/mastra/lib/util';

export function generateReviewTitle(sourceTitles: string[] = []): string {
  const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  if (sourceTitles.length > 0) {
    return sourceTitles.join(' / ');
  }
  return `New Review-${now}`;
}

/**
 * チェックリストを固定サイズで順番に分割する関数
 * @param checklists チェックリスト配列
 * @param size 1チャンクあたりの件数
 * @returns カテゴリ配列（各カテゴリはsize件、最後のみsize未満を許容）
 */
export function splitChecklistByFixedSize(
  checklists: { id: number; content: string }[],
  size: number,
): { name: string; checklists: { id: number; content: string }[] }[] {
  if (size < 1) {
    throw new Error('size must be at least 1');
  }
  if (checklists.length === 0) {
    return [];
  }

  const result: {
    name: string;
    checklists: { id: number; content: string }[];
  }[] = [];

  for (let i = 0; i < checklists.length; i += size) {
    const chunk = checklists.slice(i, i + size);
    result.push({
      name: `Part ${result.length + 1}`,
      checklists: chunk,
    });
  }

  return result;
}

/**
 * AI分類済みカテゴリを同時チェック項目数に合わせて統合する関数
 * - targetSize以上のカテゴリはtargetSize件ずつチャンク
 * - targetSize未満のカテゴリのアイテムを集約し、targetSize件ずつ新カテゴリに統合
 * @param categories AI分類済みカテゴリ配列
 * @param targetSize 目標サイズ（同時チェック項目数）
 * @returns 統合後のカテゴリ配列
 */
export function consolidateCategories(
  categories: { name: string; checklists: { id: number; content: string }[] }[],
  targetSize: number,
): { name: string; checklists: { id: number; content: string }[] }[] {
  if (targetSize < 1) {
    throw new Error('targetSize must be at least 1');
  }

  const result: {
    name: string;
    checklists: { id: number; content: string }[];
  }[] = [];

  // targetSize未満のカテゴリのアイテムを集約
  const underflowItems: { id: number; content: string }[] = [];

  for (const category of categories) {
    if (category.checklists.length >= targetSize) {
      // targetSize以上のカテゴリはtargetSize件ずつチャンク
      let partIndex = 1;
      for (let i = 0; i < category.checklists.length; i += targetSize) {
        const chunk = category.checklists.slice(i, i + targetSize);
        if (chunk.length === targetSize) {
          // 完全なチャンクのみresultに追加
          const chunkName =
            i === 0 ? category.name : `${category.name} (Part ${partIndex})`;
          result.push({ name: chunkName, checklists: chunk });
          partIndex++;
        } else {
          // 端数はunderflowに集約
          underflowItems.push(...chunk);
        }
      }
    } else {
      // targetSize未満のカテゴリのアイテムを集約
      underflowItems.push(...category.checklists);
    }
  }

  // 集約アイテムをtargetSize件ずつ新カテゴリに統合
  if (underflowItems.length > 0) {
    for (let i = 0; i < underflowItems.length; i += targetSize) {
      const chunk = underflowItems.slice(i, i + targetSize);
      const partIndex = Math.floor(i / targetSize) + 1;
      const totalParts = Math.ceil(underflowItems.length / targetSize);
      const name = totalParts === 1 ? 'その他' : `その他 (Part ${partIndex})`;
      result.push({ name, checklists: chunk });
    }
  }

  return result;
}

/**
 * ファイルのフォーマット情報（フォーマットコンテキスト構築用）
 */
export interface FileFormatInfo {
  name: string;
  formatType?: string;
  processMode: string;
  includeImages: boolean;
}

/**
 * 複数ファイルを統合したメッセージオブジェクトを作成する
 * @param files ファイルリスト
 * @param promptText プロンプトテキスト
 * @param onFileProcessing ファイル処理時のコールバック（オプション）
 */
export async function createCombinedMessage(
  files: UploadFile[],
  promptText: string,
  onFileProcessing?: (currentIndex: number, fileName: string) => void,
): Promise<{
  role: 'user';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  >;
  fileFormatInfos: FileFormatInfo[];
}> {
  // ファイル名一覧を作成
  const fileNames = files.map((file) => file.name).join(', ');

  // メッセージコンテンツを構築
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  > = [
    {
      type: 'text',
      text: `${promptText}: ${fileNames}`,
    },
  ];

  // ファイルフォーマット情報を収集
  const fileFormatInfos: FileFormatInfo[] = [];

  // FileTextExtractorはステートレスなので1インスタンスで十分
  const fileTextExtractor = new FileTextExtractor();

  // ファイル選択順に処理
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // コールバックがあれば呼び出し
    onFileProcessing?.(i, file.name);

    // 画像として処理する場合（PDF、Office ドキュメント問わず）
    if (
      file.processMode === 'image' &&
      file.imageData &&
      file.imageData.length > 0
    ) {
      // 各ページごとに個別の説明と画像を追加
      const totalPages = file.imageData.length;
      for (let pageIndex = 0; pageIndex < file.imageData.length; pageIndex++) {
        const currentPage = pageIndex + 1;

        // ページ番号を含むテキスト説明を追加
        content.push({
          type: 'text',
          text: `# ${file.name}: Page ${currentPage}/${totalPages}`,
        });

        // 該当ページの画像データを追加
        content.push({
          type: 'image',
          image: file.imageData[pageIndex],
          mimeType: 'image/png',
        });
      }

      // 画像モードのフォーマット情報を追加
      fileFormatInfos.push({
        name: file.name,
        processMode: 'image',
        includeImages: false,
      });
    } else {
      // FileTextExtractorを使用したテキスト抽出処理
      const result = await fileTextExtractor.extract(file.path, file.name);

      // includeImages=falseの場合は画像リンクを除去し、画像データを除外
      const shouldIncludeImages = file.includeImages === true;
      const textContent = shouldIncludeImages
        ? result.content
        : removeImageLinks(result.content);
      const extractedImages =
        shouldIncludeImages && result.images.length > 0
          ? result.images
          : undefined;

      // ファイルごとに個別のcontent要素として追加
      content.push({
        type: 'text',
        text: `# ${file.name}\n${textContent}`,
      });

      // 抽出された画像があれば追加
      if (extractedImages) {
        for (const image of extractedImages) {
          content.push({
            type: 'text',
            text: `[Image: ${image.referenceId}]`,
          });
          content.push({
            type: 'image',
            image: image.base64Data,
            mimeType: image.mimeType,
          });
        }
      }

      // テキスト抽出モードのフォーマット情報を追加
      fileFormatInfos.push({
        name: file.name,
        formatType: result.formatType,
        processMode: 'text',
        includeImages: shouldIncludeImages,
      });
    }
  }

  return {
    role: 'user',
    content,
    fileFormatInfos,
  };
}

/**
 * 抽出されたドキュメント情報
 */
export interface ExtractedDocument {
  name: string;
  type: string;
  textContent?: string;
  imageData?: string[];
  extractedImages?: ExtractedImage[];
}

/**
 * 複数ファイルを統合したメッセージオブジェクトを作成する（テキスト抽出済み版）
 */
export function createCombinedMessageFromExtractedDocument(
  extractedDocuments: ExtractedDocument[],
  promptText: string,
): {
  role: 'user';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  >;
} {
  // ファイル名一覧を作成
  const fileNames = extractedDocuments.map((doc) => doc.name).join(', ');

  // メッセージコンテンツを構築
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  > = [
    {
      type: 'text',
      text: `${promptText}: ${fileNames}`,
    },
  ];

  // ドキュメント順に処理
  for (const document of extractedDocuments) {
    // 画像として処理する場合（PDF、Office ドキュメント問わず）
    if (document.imageData && document.imageData.length > 0) {
      // 各ページごとに個別の説明と画像を追加
      const totalPages = document.imageData.length;
      for (
        let pageIndex = 0;
        pageIndex < document.imageData.length;
        pageIndex++
      ) {
        const currentPage = pageIndex + 1;

        // ページ番号を含むテキスト説明を追加
        content.push({
          type: 'text',
          text: `# ${document.name}: Page ${currentPage}/${totalPages}`,
        });

        // 該当ページの画像データを追加
        content.push({
          type: 'image',
          image: document.imageData[pageIndex],
          mimeType: 'image/png',
        });
      }
    } else {
      // 抽出済みテキストを使用
      content.push({
        type: 'text',
        text: `# ${document.name}\n${document.textContent}`,
      });

      // 抽出された画像があれば追加
      if (document.extractedImages && document.extractedImages.length > 0) {
        for (const image of document.extractedImages) {
          content.push({
            type: 'text',
            text: `[Image: ${image.referenceId}]`,
          });
          content.push({
            type: 'image',
            image: image.base64Data,
            mimeType: image.mimeType,
          });
        }
      }
    }
  }

  return {
    role: 'user',
    content,
  };
}
