# コードスタイル・規約

## TypeScript設定
- **厳密設定**: `strict: true`
- **ターゲット**: ES2022
- **モジュール**: Node16
- **JSX**: react-jsx（React 17+の新JSX変換）
- **パスエイリアス**: `@/*` -> `./src/*`

## ESLint規約
- **ベース**: 'erb' configuration
- **重要なルール**:
  - `react/react-in-jsx-scope`: 'off' （React 17+のため）
  - `@typescript-eslint/no-shadow`: 'error' （TypeScript版を使用）
  - `@typescript-eslint/no-unused-vars`: 'off' （開発中は無効）
  - `no-console`: 'off' （コンソール使用許可）
  - `react/require-default-props`: 'off' （デストラクチャリングでデフォルト値設定を許可）
  - `react/function-component-definition`: arrow-functionを許可

## Prettier設定
- **シングルクォート**: 有効
- **JSON設定**: 特別パース設定

## 命名規約
### React コンポーネント
- **ファイル名**: PascalCase（例：`SidebarHeader.tsx`）
- **コンポーネント名**: PascalCase
- **プロップス型**: ComponentNameProps（例：`SidebarHeaderProps`）

### 関数・変数
- **関数**: camelCase（例：`handleFeatureChange`）
- **定数**: UPPER_SNAKE_CASE（例：`FEATURES`）
- **変数**: camelCase

### ファイル構造
- **コンポーネントディレクトリ**: 機能別（chat/, sidebar/, common/, review/）
- **型定義**: `types.ts`または同一ファイル内でinterface定義

## コメント規約
- **コードコメント**: 日本語で記載
- **プロンプト**: 英語で記載（Mastra AIエージェント用）
- **TSDocコメント**: 必要に応じて英語

## インポート規約
- **外部ライブラリ**: 最初にグループ化
- **内部モジュール**: @/から始まるパスエイリアス使用
- **相対パス**: ./または../で明示

## 制約事項
- **async iterator**: 使用非推奨（パフォーマンス理由）
- **for-await-of**: ESLintで禁止設定
- **非同期処理**: Promise chainまたはasync/await推奨