import FileExtractor from '@/main/lib/fileExtractor';
import { UploadFile } from '@/types';

/**
 * 複数ファイルを統合したメッセージオブジェクトを作成する
 */
export async function createCombinedMessage(
  files: UploadFile[],
  promptText: string,
): Promise<{
  role: 'user';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  >;
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

  // ファイル選択順に処理
  for (const file of files) {
    // PDFで画像として処理する場合
    if (
      file.type === 'application/pdf' &&
      file.pdfProcessMode === 'image' &&
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
    } else {
      // テキスト抽出処理
      const { content: fileContent } = await FileExtractor.extractText(file.path, {
        useCache: true,
      });

      // ファイルごとに個別のcontent要素として追加
      content.push({
        type: 'text',
        text: `# ${file.name}\n${fileContent}`,
      });
    }
  }

  return {
    role: 'user',
    content,
  };
}
