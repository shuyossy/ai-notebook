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
- `src/types`：アプリで利用する型・zodスキーマの定義
  - `src/types/index.ts`：アプリ全体で利用する型定義のエントリーポイント（ただし、個別の機能等で型を定義する場合は各機能ディレクトリに作成しているので別途参照が必要）
  - `src/types/ipc.ts`：Electron IPC通信で利用する型定義
- `src/db`: データベース定義（スキーマやDB接続情報）
- `src/repository`: データアクセス層
- `src/main`: Electronのメインプロセス関連のコード
  - `src/main.ts`: Electronのメインプロセスのエントリポイント、IPC通信のハンドラの具体的な処理の定義やアプリケーションの初期化処理などを含む
  - `src/main/preload.ts`: ElectronのPreloadスクリプト、レンダラープロセスに公開するハンドラを定義(rendererとの境界にあたるため、ここで一元的にエラーハンドリングを実施している)
  - `src/main/store.ts`: electron-storeを利用してアプリケーションの設定や状態の保存・取得を行う、ここではstoreの初期化や設定の定義を行う
  - `src/main/lib`: メインプロセスで利用するライブラリ群
    - `src/main/lib/logger.ts`: アプリ内で利用するロガーを提供
    - `src/mian/lib/error.ts`: アプリで利用するエラー定義
    - `src/main/lib/message.ts`: アプリ内で利用するメッセージテンプレートを解決し、メッセージを提供する関数を提供（メッセージテンプレートはこちら`src/messages/ja/template.ts`）
    - `src/main/lib/utils/fileExtractor.ts`: 登録されたソースのテキスト情報を抽出する関数
- `src/renderer/components`：Reactコンポーネント
  - `src/renderer/components/chat`: チャット機能のコンポーネント
  - `src/renderer/components/review`: レビュー機能のコンポーネント
  - `src/renderer/components/chat`: チャット機能のコンポーネント
  - `src/renderer/components/common`: アプリ共通のコンポーネント
  - `src/renderer/components/sidebar`: サイドバー共通のコンポーネント
  - `src/renderer/hooks`: フック定義をまとめたディレクトリ
  - `src/renderer/service`: フロントエンドから利用するサービス層で、外部アクセスロジックもここで管理する(~Api.ts)
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

## 実装上の注意
- Mastraについては実装する際はまずMCPでドキュメントや実装例を参考にしてから正確な情報やベストプラクティスに基づいてコーディングすること
- Mastra workflowの作成時は既存のスタイルを踏襲すること
- プロジェクト全体を把握して、全ての実装が必要箇所を正しく洗い出してから実装すること
- 既存資源（型情報やコンポーネントなど）を積極的に活用して効率的に実装すること
  - 既存のコードの修正は真に必要な場合に限ること
- UIは実際に市場に投入できるくらいレベルの高いUIにすること
- TypeScriptを利用して型安全なコードにすること
- プロンプトは英語で記載すること
  - プロンプトの内容は経験豊富なプロンプトエンジニアとしてベストプラクティスに基づいて実装すること
  - 一般的で自然な英語表現にすること
- コードのコメントは日本語で記載すること
- Reactライブラリが使えるのであれば積極的に利用すること
    - 特にUIについてはMUIを第一優先に使い、カスタマイズしたい場合はshadcn/uiを利用すること
    - ライブラリを追加する際は安定稼働バージョンを採用すること
- eslintについては単純なフォーマットエラーの場合は対応する必要はない
- IDEからエラー内容を読み取り、必要があれば確り対応すること
- `src/main/preload.ts`にてエラーを一元管理しているため、IPCハンドラ内のサービスロジックにおいては基本的にはエラーをtry-catchしてハンドリングする必要はない
  - ただし、ユーザにエラーメッセージを通知する必要がある場合は適切なエラーハンドリングの下、`src/mian/lib/error.ts`にて提供されているAppErrorをthrowすること
- テストについては指示されない限り、実行も修正もしなくてよい

## 現在実施中のタスク
大規模リファクタリング
- エラー処理の改善
  - Main側：完了
    - `src/mian/lib/error.ts`でAppError例外の導入
    - IPCハンドラのエラーやレスポンスについて、`src/main/preload.ts`にて一元的に管理するラッパを導入
  Renderer側：一部未済
    - 元々`src/renderer/service/~Service.ts`というモジュールにて外部IPC通信を管理していたが、このファイルを全て削除
    - 新規に`src/renderer/service/~Api.ts`というモジュールを作成し、外部通信IFを提供する


### 依頼タスク
- rendererのリファクタリング
  - 現在、renderer側で完成している部分は以下です。これらを参考に残りのリファクタリングを完成させてください。
    - `src/renderer/components/chat/ChatArea.tsx`
    - `src/renderer/components/chat/ChatRoomList.tsx`
    - `src/renderer/components/review/ReviewArea.tsx`
    - `src/renderer/lib/apiUtils.ts`
    - `src/renderer/service/chatApi.ts`
    - `src/renderer/service/reviewApi.ts`
  - リファクタリング方針
    - window.~で直接IPC通信を発行するのではなく、`src/renderer/service/~Api.ts`（外部通信IF）を経由させる
    - renderer配下の全てのコードについて、既存の`src/renderer/service/~Service.ts`を呼び出し部について全てあげ出し（tsエラーの一覧を調べるのが簡単か？）、上記外部通信IFを適切に呼び出す
    - Main側コード、テストコードでも型エラーが出ているが、ここについては対応不要（ただし、renderer側全ての型エラーに対応すること）
