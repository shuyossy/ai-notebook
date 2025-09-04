# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリでコードを作業する際のガイダンスを提供します。

## 共通コマンド

### 開発環境
```bash
npm start
```

### リント・フォーマット
```bash
npm run check # TypeScriptの型チェック
```
加えて、IDEからのエラー情報も読み取るようにしてください

### テスト
```bash
npm test
```

### データベース関連
```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:prepare
npm run db:studio
```

## アーキテクチャ概要

### プロジェクト構成
本プロジェクト「AIKATA」は、Electron製のAIデスクトップアプリケーションで、以下の機能を提供する
- アプリケーション設定機能
  - 以下を設定できる
  - アプリ内で利用するAI APIのURL・キー
  - 後述のチャット機能のユーザカスタムシステムプロンプト
  - MCPサーバ設定
   - チャット機能で利用可能なMCPサーバを指定する
  - アプリが利用するDB（ローカルにSQLiteとして保存）のパス
    - DBにはチャット履歴やドキュメントの要約情報（チャット機能でシステムプロンプトに検索可能なドキュメントを提示するために利用する）を保存する
  - Redmine・GitLabのAPI・アクセストークン
    - チャット機能で利用
  - ドキュメント登録用ディレクトリ
    - チャット機能でAIが参照できるファイルが格納されてあるディレクトリを指定
- ドキュメント登録機能
  - チャット機能でユーザが登録したドキュメントから抽出したテキスト情報にアクセスできるようにする
  - 抽出したテキストはアプリのUserDataディレクトリにファイルキャッシュとして保存
- チャット機能
  - AIエージェントが以下のツールを利用しながらユーザの指示に対応する
    - ドキュメント検索ツール
      - 指定したドキュメント登録用ディレクトリ内にあるファイルをAIが参照することができる
        - 厳密には、ドキュメント検索ツール(該当ディレクトリ内ファイルを読み込んだ別のAIエージェントに質問することができるツール)をチャット用AIエージェントに使わせることができる
    - GitLab操作ツール
    - Redmine操作ツール
    - MCP連携
- ドキュメントレビュー機能
  - チェックリストをあるドキュメントから抽出して、そのリストを元に別のドキュメントのレビューを実行する機能
    - サブ機能は以下（Mastraのworkflowを利用して実装）
      - チェックリスト抽出機能
        - チェックリストドキュメントからのチェックリスト項目抽出機能
        - 一般ドキュメントからのチェックリスト項目作成機能
      - （上記で抽出したチェックリスト項目に対して）ドキュメントレビュー実行機能
    - ユーザは対象ドキュメントをファイルアップロード形式で指定する
       - 基本的にはアップロードされたファイルはテキスト抽出処理が実行され、後続のworkflow処理で利用される
         - ただし、PDFファイルについてはテキスト抽出か画像として処理するか選択することができる
           - 画像にした場合は図なども認識させることができるため
### 技術スタック
- **フレームワーク**: Electron(electron-react-boilerplate) + React + TypeScript
- **UI**: Material-UI (MUI)
- **データベース**: SQLite (Drizzle ORM)  
- **AIフレームワーク**: Mastra（エージェント・ワークフロー管理）
- **バンドラー**: Webpack
- **テスト**: Jest + Testing Library

### アーキテクチャ階層

#### 1. Electronプロセス
- **メインプロセス** (`src/main/main.ts`): アプリケーションのエントリーポイント、IPC通信管理
- **レンダラープロセス** (`src/renderer/`): Reactベースのフロントエンド UI
  - レイアウトは`src/renderer/App.tsx`で定義しており、各機能はsrc/renderer/components/sidebar/SidebarHeader.tsxで切り替え

#### 2. Mastraフレームワーク統合 (`src/mastra/`)
- **エージェント**（`src/mastra/agents`）: 特定のタスクを実行するAgent
- **ツール**（`src/mastra/tools`）: 外部システム（GitLab、Redmine、MCP）との統合
- **ワークフロー**（`src/mastra/workflows`）: 複雑なタスクの自動化フロー

#### 3. データベース層 (`src/db/`)
- **スキーマ**（`src/db/schema.ts`）: Drizzleで定義されたテーブル構造
- **リポジトリ**（`src/db/repository`）: データアクセス層
- SQLiteベースの軽量データベース

#### 4. サービス層 (`src/main/service/`)
- **ChatService**: チャット機能のビジネスロジック
- **ReviewService**: レビュー機能のビジネスロジック  
- **SettingsService**: アプリケーション設定管理

### IPC通信パターン
ElectronのIPCを使用してフロントエンド・バックエンド間の通信を実装。チャネル定義は`src/main/types/ipc.ts`で管理。

### 設定管理
- Electron-storeを使用したアプリケーション設定の永続化
- 環境変数とランタイム設定の分離

### その他代表的なフォルダ・ファイル
- `src/main/types`：アプリで利用する型・zodスキーマの定義
  - `index.ts`：アプリ全体で利用する型定義
  - `ipc.ts`：Electron IPC通信で利用する型定義
- `src/main`: Electronのメインプロセス関連のコード
  - `src/main.ts`: Electronのメインプロセスのエントリポイント、IPC通信のハンドラの具体的な処理の定義やアプリケーションの初期化処理などを含む
  - `src/main/preload`: ElectronのPreloadスクリプト、レンダラープロセスに公開するハンドラを定義
  - `src/main/store.ts`: electron-storeを利用してアプリケーションの設定や状態の保存・取得を行う、ここではstoreの初期化や設定の定義を行う
  - `src/main/utils`: メインプロセスで利用するユーティリティ関数
    - `src/main/utils/fileExtractor.ts`: 登録されたソースのテキスト情報を抽出する関数
- `src/renderer/components`：Reactコンポーネント
  - `src/renderer/components/chat`: チャット機能のコンポーネント
  - `src/renderer/components/review`: レビュー機能のコンポーネント
  - `src/renderer/components/chat`: チャット機能のコンポーネント
  - `src/renderer/components/common`: アプリ共通のコンポーネント
  - `src/renderer/components/sidebar`: サイドバー共通のコンポーネント
  - `src/renderer/hooks`: フック定義をまとめたディレクトリ
  - `src/renderer/service`: フロントエンドから利用するサービス定義をまとめたディレクトリ
  - `src/renderer/stores`: zustandで管理するstate定義
- `src/mastra`: Mastraを利用したAI関連のコード
  - `src/mastra/agents/prompt.ts`: Mastraのエージェントのプロンプト定義を一箇所に集約（エージェントやワークフロー内で利用するプロンプトを定義）
  - `src/mastra/agents/orchestrator.ts`: 汎用チャット機能で利用するAIエージェントの定義
  - `src/mastra/workflows`: Mastraのワークフロー定義
    - `src/mastra/workflows/sourceRegistration`: ドキュメントのテキスト抽出用のワークフロー定義
    - `src/mastra/workflows/sourceReview`: ドキュメントレビュー用のワークフロー定義
    - `src/mastra/workflows/types.ts`: ワークフローで利用する型定義
    - `src/mastra/workflows/schema.ts`: ワークフローで利用するzodスキーマ定義（ワークフローを作成する際は、各Stepのoutputschemaは必ず本ファイル内に定義されているbaseStepOutputSchemaを継承するようにしてください）

## テスト作成時の注意
- 明確な指示がある場合以外はテストコードを作成しないこと
- 外部ライブラリとの結合をテストする場合はできるだけ実際のライブラリを使用すること
  - 実際のライブラリの利用が難しい場合はモックを利用すること
  - Electron IPCはモックを利用すること
    - モックの実装はsrc/__tests__/test-utils/mockElectronHandler.tsに集約させること
- 下記の観点からテストを作成すること
  - ビジネス的な観点
    - 正常系
    - 異常系
  - 技術的な観点
    - 正常系
    - 異常系
- テストに関連するプロダクトコードのカバレッジを100%にすること
- テスト関連コードはsrc/__test__に配置すること
- テストは古典派的なスタイルで記述すること
  - つまり、単体テストはクラス単位ではなく、一つの振る舞い単位で記述すること
- テストの説明は日本語で記述すること
  - テストの説明は、何をテストしているのか、どのような条件でテストが行われるのかを明確に記述すること
- テストの書き方で不明点があれば次のディレクトリ配下のテストコードを参考にすること
  - src/__tests__/integration
