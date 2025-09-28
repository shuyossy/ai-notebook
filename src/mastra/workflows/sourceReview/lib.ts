import { format } from 'date-fns';
import { ReviewChecklist } from '@/types';

export function generateReviewTitle(sourceTitles: string[] = []): string {
  const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  if (sourceTitles.length > 0) {
    return sourceTitles.join(' / ');
  }
  return `New Review-${now}`;
}

// チェックリストを「要素数の差は最大1かつ
// 1パートあたり maxSize 件以下」に分割する関数
export function splitChecklistEquallyByMaxSize(
  checklist: ReviewChecklist[],
  maxSize: number,
): { name: string; checklists: { id: number; content: string }[] }[] {
  // 1) maxSize のバリデーション
  //    1 未満だと「1パートに1件以上」のルールを守れなくなるのでエラーにする
  if (maxSize < 1) {
    throw new Error('maxSize must be at least 1');
  }

  const n = checklist.length;
  // 2) 空リストならすぐに空配列を返す
  if (n === 0) {
    return [];
  }

  // 3) 必要なパート数を計算
  //    n / maxSize を切り上げることで、
  //    いずれのパートも maxSize を超えない最小のパート数 parts が得られる
  const parts = Math.ceil(n / maxSize);

  // 4) 等分割のための基礎情報を計算
  //    baseSize は「最低保証サイズ」、remainder は余り
  //    → 先頭 remainder 個のパートに +1 して差を最大1に抑える
  const baseSize = Math.floor(n / parts);
  const remainder = n % parts;

  const result: {
    name: string;
    checklists: { id: number; content: string }[];
  }[] = [];
  let offset = 0; // スライス開始インデックス

  // 5) 各パートを順番に切り出す
  for (let i = 0; i < parts; i++) {
    // 先頭 remainder 個のパートだけ +1
    const thisSize = baseSize + (i < remainder ? 1 : 0);

    // slice は end が length を超えても安全に末尾まで取得してくれる
    const partChecklist = checklist.slice(offset, offset + thisSize);

    result.push({
      name: `Part ${i + 1}`,
      checklists: partChecklist.map((item) => ({
        id: item.id,
        content: item.content,
      })),
    });

    offset += thisSize;
  }

  return result;
}

/**
 * 抽出されたドキュメント情報
 */
export interface ExtractedDocument {
  name: string;
  type: string;
  textContent?: string;
  imageData?: string[];
}

/**
 * 複数ファイルを統合したメッセージオブジェクトを作成する（テキスト抽出済み版）
 */
export function createCombinedMessage(
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
    // PDFで画像として処理する場合
    if (
      document.type === 'application/pdf' &&
      document.imageData &&
      document.imageData.length > 0
    ) {
      // 各ページごとに個別の説明と画像を追加
      const totalPages = document.imageData.length;
      for (let pageIndex = 0; pageIndex < document.imageData.length; pageIndex++) {
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
    }
  }

  return {
    role: 'user',
    content,
  };
}
