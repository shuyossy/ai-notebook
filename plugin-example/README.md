# AIKATA Review Plugin Example

このプロジェクトは、AIKATAレビューシステム用のプラグインを作成するためのスケルトンプロジェクトです。

## 概要

AIKATAレビューシステムでは、レビュー実行時にカスタム処理を挟み込むことができるプラグイン機能を提供しています。
プラグインを使用することで、以下のようなカスタマイズが可能です：

1. **beforeSmallDocumentReview フック**: 少量ドキュメントレビュー実行前にドキュメントをフィルタリング・前処理
2. **beforeLargeDocumentReview フック**: 大量ドキュメントレビュー時の個別ドキュメント処理前にドキュメントをフィルタリング・前処理
3. **chunkStrategy フック**: 大量ドキュメントレビュー時のカスタム分割戦略

## セットアップ

```bash
# 依存関係のインストール
npm install

# プラグインのビルド
npm run build

# 開発モード（ウォッチモード）
npm run dev

# リントチェック
npm run lint
```

## ビルド

プラグインをビルドすると、`dist/index.js`に単一のJavaScriptファイルが生成されます。
このファイルをAIKATAアプリケーションにアップロードすることで、プラグインを利用できます。

```bash
npm run build
```

ビルドされたファイルは以下のパスに生成されます：
```
dist/index.js
```

## プラグインの使用方法

1. `npm run build`でプラグインをビルド
2. AIKATAアプリケーションのレビュー画面でプラグインファイル（`dist/index.js`）をアップロード
3. レビューを実行すると、プラグインのフックが自動的に呼び出されます

## プラグインの実装

`src/index.ts`にプラグインの実装を記述します。

### プラグインの構造

```typescript
import type { ReviewPlugin } from './types';

const plugin: ReviewPlugin = {
  name: 'your-plugin-name',
  version: '1.0.0',
  hooks: {
    beforeSmallDocumentReview: async (context) => {
      // 少量レビュー前の前処理
      return context.documents;
    },
    beforeLargeDocumentReview: async (context) => {
      // 大量レビュー時の個別ドキュメント前処理
      // nullを返すとドキュメントをスキップできます
      return context.document;
    },
    chunkStrategy: async (context) => {
      // カスタム分割戦略
      return [{ start: 0, end: context.document.textContent?.length || 0 }];
    },
  },
};

export default plugin;
```

> **注意**: すべてのフックは省略可能です。必要なフックのみを実装してください。

### beforeSmallDocumentReview フック

少量ドキュメントレビュー実行前にドキュメントをフィルタリング・前処理するためのフックです。

少量レビューモードでは、複数のドキュメントを一度にAIに渡してレビューします。
このフックでは、レビュー対象として不適切なドキュメントを除外したり、ドキュメント内容を前処理したりできます。

**コンテキスト:**
- `documents`: レビュー対象ドキュメント配列
- `checklists`: チェックリスト項目配列
- `additionalInstructions`: ユーザーからの追加指示
- `commentFormat`: コメントフォーマット指定
- `evaluationSettings`: カスタム評価設定

**戻り値:**
- フィルタリング・前処理後のドキュメント配列

**使用例:**
```typescript
beforeSmallDocumentReview: async (context) => {
  // 空のドキュメントを除外
  return context.documents.filter(doc => {
    // テキストドキュメントの場合
    if (doc.textContent) {
      return doc.textContent.trim().length > 0;
    }
    // 画像ドキュメントの場合
    if (doc.imageData) {
      return doc.imageData.length > 0;
    }
    return true;
  });
}
```

### beforeLargeDocumentReview フック

大量ドキュメントレビュー時の個別ドキュメント処理前にドキュメントをフィルタリング・前処理するためのフックです。

大量レビューモードでは、各ドキュメントを個別にAIに渡してレビューします。
このフックでは、個々のドキュメントに対して前処理を行ったり、特定の条件でスキップしたりできます。

**コンテキスト:**
- `document`: レビュー対象ドキュメント
- `checklists`: チェックリスト項目配列
- `additionalInstructions`: ユーザーからの追加指示
- `commentFormat`: コメントフォーマット指定

**戻り値:**
- フィルタリング・前処理後のドキュメント、またはスキップする場合は `null`

**使用例:**
```typescript
beforeLargeDocumentReview: async (context) => {
  // 特定の条件でドキュメントをスキップ
  const hasSecurityChecklist = context.checklists.some(c =>
    c.content.includes('セキュリティ')
  );

  // セキュリティチェックリストがない場合、PDF以外をスキップ
  if (!hasSecurityChecklist) {
    const isPdf = context.document.type === 'application/pdf' ||
                  context.document.name.endsWith('.pdf');
    if (!isPdf) {
      return null; // ドキュメントをスキップ
    }
  }

  return context.document; // 処理を続行
}
```

### chunkStrategy フック

大量ドキュメントレビュー時のカスタム分割戦略を提供するフックです。

ドキュメントが大きすぎてAIのコンテキストに収まらない場合、このフックを使用してドキュメントを分割する方法をカスタマイズできます。

**コンテキスト:**
- `document`: 分割対象ドキュメント
- `splitCount`: 分割数
- `retryCount`: リトライ回数（コンテキスト長エラー時に増加）

**戻り値:**
- 分割範囲の配列 `Array<{ start: number; end: number }>`

**使用例（段落境界を考慮した分割）:**
```typescript
chunkStrategy: async (context) => {
  if (context.document.textContent) {
    const text = context.document.textContent;
    const totalLength = text.length;

    // 段落の境界を検出（ダブル改行）
    const paragraphBoundaries: number[] = [0];
    const regex = /\n\n/g;
    let match;
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

    return ranges;
  }

  // 画像ドキュメントの場合は均等分割
  const imageCount = context.document.imageData?.length || 0;
  const chunkSize = Math.floor(imageCount / context.splitCount);
  const ranges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < context.splitCount; i++) {
    const start = i * chunkSize;
    const end = i === context.splitCount - 1 ? imageCount : (i + 1) * chunkSize;
    ranges.push({ start, end });
  }

  return ranges;
}
```

## ビルドプロセスの検証

プラグインのビルド時（`npm run build`および`npm run dev`）には、以下の検証が自動的に実行されます：

### 1. ESLintによるコード検証

ビルド前にESLintが自動実行され、以下を検出します：
- 動的`require()`の使用
- 動的`import()`の使用
- TypeScript型エラー

違反が検出された場合、ビルドは失敗します。

**エラー例:**
```
error  Dynamic import() is not allowed in plugins for security reasons
```

### 2. ネイティブモジュール検出

ビルドプロセス中、以下のネイティブモジュール使用を自動検出し、ビルドを失敗させます：

**検出方法:**
- `.node`ファイル（ネイティブバイナリモジュール）の直接import
- `package.json`に`gypfile`または`binary`フィールドを持つパッケージ
- `binding.gyp`ファイルを含むパッケージ
- `build/Release/*.node`パターンを持つパッケージ

**エラー例:**
```
error: Native module detected: sqlite3
  This package contains native bindings and cannot be used in plugins for security and portability reasons.
```

## 制限事項

プラグインには以下の制限があります：

1. **動的require/importの禁止**: セキュリティ上の理由から、動的な`require()`や`import()`は使用できません
2. **ネイティブモジュールの禁止**: Node.jsのネイティブモジュール（C++アドオンなど）は使用できません
3. **実行タイムアウト**: フックの実行には5秒のタイムアウトが設定されています

これらの制限に違反すると、ビルドが失敗します。

## デバッグ

プラグイン内で`console.log`、`console.error`などを使用すると、AIKATAアプリケーションのログに出力されます。
デバッグ時に活用してください。

```typescript
beforeSmallDocumentReview: async (context) => {
  console.log('[Plugin] Documents received:', context.documents.length);
  console.log('[Plugin] Checklists:', context.checklists.length);
  // ...
}

beforeLargeDocumentReview: async (context) => {
  console.log('[Plugin] Processing document:', context.document.name);
  // ...
}

chunkStrategy: async (context) => {
  console.log('[Plugin] Splitting document:', context.document.name);
  console.log('[Plugin] Split count:', context.splitCount, 'Retry count:', context.retryCount);
  // ...
}
```

## ライセンス

MIT
