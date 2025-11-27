import type {
  ReviewPlugin,
  SingleDocumentFilterHook,
  ChunkStrategyHook,
} from './types';

/**
 * AIKATAレビュープラグインのサンプル実装
 *
 * このプラグインは以下の3つのフックを提供します：
 * 1. beforeSmallDocumentReview: 少量ドキュメントレビュー実行前のフィルタリング・前処理
 * 2. beforeLargeDocumentReview: 大量ドキュメントレビュー時の個別ドキュメント処理前のフィルタリング・前処理
 * 3. chunkStrategy: 大量ドキュメントレビュー時のカスタム分割戦略
 */
const plugin: ReviewPlugin = {
  name: 'example-review-plugin',
  version: '1.0.0',
  hooks: {
    /**
     * 少量ドキュメントレビュー実行前のフィルタリング・前処理フック
     *
     * 少量レビューモードでは、複数のドキュメントを一度にAIに渡してレビューします。
     * このフックでは、レビュー対象として不適切なドキュメントを除外したり、
     * ドキュメント内容を前処理したりできます。
     *
     * 例: 空のドキュメントを除外
     */
    beforeSmallDocumentReview: async (context) => {
      console.log('[Plugin] beforeSmallDocumentReview hook called');
      console.log(`[Plugin] Received ${context.documents.length} documents`);

      // 空のドキュメントを除外する例
      const filteredDocuments = context.documents.filter((doc) => {
        // テキストドキュメントの場合、空でないことを確認
        if (doc.textContent) {
          const hasContent = doc.textContent.trim().length > 0;
          if (!hasContent) {
            console.log(`[Plugin] Filtered out empty document: ${doc.name}`);
          }
          return hasContent;
        }

        // 画像ドキュメントの場合、画像データが存在することを確認
        if (doc.imageData) {
          const hasImages = doc.imageData.length > 0;
          if (!hasImages) {
            console.log(
              `[Plugin] Filtered out document with no images: ${doc.name}`,
            );
          }
          return hasImages;
        }

        return true;
      });

      console.log(`[Plugin] Filtered to ${filteredDocuments.length} documents`);
      return filteredDocuments;
    },

    /**
     * 大量ドキュメントレビュー時の個別ドキュメント処理前のフィルタリング・前処理フック
     *
     * 大量レビューモードでは、各ドキュメントを個別にAIに渡してレビューします。
     * このフックでは、個々のドキュメントに対して前処理を行ったり、
     * 特定の条件でスキップしたりできます。
     *
     * 例: 特定のチェックリストに対してドキュメントをスキップ
     */
    beforeLargeDocumentReview: (async (context) => {
      console.log('[Plugin] beforeLargeDocumentReview hook called');
      console.log(`[Plugin] Processing document: ${context.document.name}`);
      console.log(`[Plugin] Checklist items: ${context.checklists.length}`);

      // 例: 特定の条件でドキュメントをスキップ
      // この例では、チェックリストに「セキュリティ」が含まれていない場合、
      // PDFドキュメント以外をスキップする（nullを返す）
      const hasSecurityChecklist = context.checklists.some((c) =>
        c.content.includes('セキュリティ'),
      );

      if (!hasSecurityChecklist) {
        const isPdf =
          context.document.type === 'application/pdf' ||
          context.document.name.endsWith('.pdf');
        if (!isPdf) {
          console.log(
            `[Plugin] Skipped non-PDF document (no security checklist): ${context.document.name}`,
          );
          return null; // ドキュメントをスキップ
        }
      }

      // セキュリティチェックリストがある場合、またはPDFドキュメントの場合は処理を続行
      return context.document;
    }) satisfies SingleDocumentFilterHook,

    /**
     * 大量ドキュメントレビュー時のカスタム分割戦略フック
     *
     * 例: セマンティックな境界を考慮した分割
     */
    chunkStrategy: (async (context) => {
      console.log('[Plugin] chunkStrategy hook called');
      console.log(`[Plugin] Document: ${context.document.name}`);
      console.log(
        `[Plugin] Split count: ${context.splitCount}, Retry count: ${context.retryCount}`,
      );

      // テキストドキュメントの場合、段落境界を考慮した分割を行う例
      if (context.document.textContent) {
        const text = context.document.textContent;
        const totalLength = text.length;

        // 段落の境界を検出（ダブル改行）
        const paragraphBoundaries: number[] = [0];
        const regex = /\n\n/g;
        let match;
        // eslint-disable-next-line no-cond-assign
        while ((match = regex.exec(text)) !== null) {
          paragraphBoundaries.push(match.index);
        }
        paragraphBoundaries.push(totalLength);

        // 各チャンクのおおよそのサイズを計算
        const chunkSize = Math.floor(totalLength / context.splitCount);

        // 段落境界に最も近い位置でチャンクを分割
        const ranges: Array<{ start: number; end: number }> = [];
        let currentStart = 0;

        for (let i = 1; i < context.splitCount; i++) {
          const targetPosition = i * chunkSize;

          // targetPositionに最も近い段落境界を見つける
          let closestBoundary = paragraphBoundaries[0];
          let minDistance = Math.abs(targetPosition - closestBoundary);

          for (const boundary of paragraphBoundaries) {
            const distance = Math.abs(targetPosition - boundary);
            if (distance < minDistance && boundary > currentStart) {
              minDistance = distance;
              closestBoundary = boundary;
            }
          }

          ranges.push({ start: currentStart, end: closestBoundary });
          currentStart = closestBoundary;
        }

        // 最後のチャンク
        ranges.push({ start: currentStart, end: totalLength });

        console.log(
          `[Plugin] Created ${ranges.length} chunks based on paragraph boundaries`,
        );
        return ranges;
      }

      // 画像ドキュメントの場合は均等分割を返す
      // 注: カスタム分割が不要な場合は、このフック自体を定義しないことを推奨
      console.log(
        '[Plugin] Using simple equal-size chunking strategy for image document',
      );
      const imageCount = context.document.imageData?.length || 0;
      const chunkSize = Math.floor(imageCount / context.splitCount);
      const ranges: Array<{ start: number; end: number }> = [];

      for (let i = 0; i < context.splitCount; i++) {
        const start = i * chunkSize;
        const end =
          i === context.splitCount - 1 ? imageCount : (i + 1) * chunkSize;
        ranges.push({ start, end });
      }

      return ranges;
    }) satisfies ChunkStrategyHook,
  },
};

export default plugin;
