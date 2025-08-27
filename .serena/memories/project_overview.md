# AIKATA プロジェクト概要

## プロジェクトの目的
AIKATAは、AIデスクトップアプリケーションで以下の機能を提供する：

- **アプリケーション設定機能**: AI APIのURL・キー、チャット機能のユーザーカスタムシステムプロンプト、MCPサーバー設定、DB（SQLite）のパス、Redmine・GitLabのAPI・アクセストークン、ドキュメント登録用ディレクトリの設定
- **ドキュメント登録機能**: word、excel、pdf、txtのようなファイルからテキストを抽出し、AI機能で利用できるようにする
- **チャット機能**: AIエージェントがドキュメント検索、GitLab操作、Redmine操作、MCP連携ツールを使ってユーザーの指示に対応
- **ドキュメントレビュー機能**: チェックリストをドキュメントから抽出し、そのリストでレビュー実行

## 技術スタック

### コアテクノロジー
- **フレームワーク**: Electron（electron-react-boilerplate） + React + TypeScript
- **UI**: Material-UI (MUI) + shadcn/ui
- **データベース**: SQLite（Drizzle ORM）
- **AIフレームワーク**: Mastra（エージェント・ワークフロー管理）
- **バンドラー**: Webpack
- **テスト**: Jest + Testing Library

### 開発ツール
- **ESLint**: 'erb' config基盤、TypeScript対応
- **Prettier**: シングルクォート設定
- **TypeScript**: 厳密設定（strict: true）

## プロジェクト構造
```
src/
├── main/           # Electronメインプロセス
├── renderer/       # Reactフロントエンド
├── mastra/         # Mastra AI統合
├── db/            # データベース層
└── __tests__/     # テストファイル
```