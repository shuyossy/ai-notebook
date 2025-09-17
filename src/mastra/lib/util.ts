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
      // 画像ファイル用のテキスト説明を追加
      content.push({
        type: 'text',
        text: `# ${file.name}(Attached below as image)`,
      });

      // 画像データを追加
      for (const imageData of file.imageData) {
        content.push({
          type: 'image',
          image: imageData,
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
