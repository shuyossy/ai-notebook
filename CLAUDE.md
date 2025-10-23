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
        - 少量ドキュメントのレビュー機能
          - 与えられたドキュメントを全てレビュー用AIのコンテキストに与える
        - 大量ドキュメントレビュー機能
          - 以下のようなworkflowでレビューを実行
            - 個々のドキュメントに対して、レビュー対象チェックリストを基にレビューを実施させる
              - ドキュメントがAIの入力コンテキストに収まらなかった場合は適宜ドキュメントを分割する
            - 最終的に全てのドキュメントのレビュー結果を合わせて、それを統合してドキュメント全体としてのレビュー結果を出力させる
      - （ドキュメントレビュー結果に対する）質問機能
    - チェックリスト抽出・レビュー機能においてアップデート可能なファイルは以下
      - word,excel,powerpoint,pdf,テキスト文書
        - テキスト抽出するか画像としてAIに送信するか選択することができる
          - 画像として送信する場合はpdfを画像化する(renderer側で画像化※main側ではcanvasが扱いづらかったため)
            - office文書についてはmain側で一度pdf化してから画像化する
      - また、複数ファイルを選択することができ、その場合は、複数ファイルが一つの統合ドキュメントとして認識される(よくある、本紙・別紙などのドキュメントに対応)
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
  - `src/types/eventPush.ts`: Main側からのイベントプッシュで利用する型定義
- `src/adapters`: portの実装
  - `src/adapters/db/drizzle`: drizzleのスキーマ定義、repository実装
- `src/main`: Electronのメインプロセス関連のコード
  - `src/main.ts`: Electronのメインプロセスのエントリポイント、IPC通信のハンドラの具体的な処理の定義やアプリケーションの初期化処理などを含む
  - `src/main/preload.ts`: ElectronのPreloadスクリプト、レンダラープロセスに公開するハンドラを定義(rendererとの境界にあたるため、ここで一元的にエラーハンドリングを実施している)
  - `src/main/store.ts`: electron-storeを利用してアプリケーションの設定や状態の保存・取得を行う、ここではstoreの初期化や設定の定義を行う
  - `src/main/service`: サービス（コア）ロジック
  - `src/mian/service/port`: 外部通信の抽象
    - `src/mian/service/port/repository`: 外部DB通信（リポジトリ）の抽象
  - `src/main/push`: Main側からのイベントプッシュ関連コード
    - `src/main/push/InProcBroker.ts`: イベントを蓄積するBroker
    - `src/main/push/electronPushBroker.ts`: イベント購読についてelectron固有の差異を吸収するBroker
  - `src/main/lib`: メインプロセスで利用するライブラリ群
    - `src/main/lib/eventPayloadHelper.ts`: イベントをpushする際のヘルパーを提供
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
    - `src/renderer/hooks/usePushChannel.ts`: イベント購読をする際に利用するフック（コンポーネントが常時通信をSSEでデータを受け取れるようにしたい場合に利用）
    - `src/renderer/hooks/useSettings.ts`: 設定情報を利用したい場合に利用するフック
  - `src/renderer/service`: フロントエンドから利用するサービス層で、外部アクセスロジックもここで管理する(~Api.ts)
  - `src/renderer/stores`: zustandで管理するstate定義
    - `src/renderer/stores/alertStore.ts`: renderer側のユーザに表示するアラートメッセージを一元管理する、addAlertを公開しており、これを利用してalertを追加するとエラーを表示できる
  - `src/renderer/lib/ElectronPushClient.ts`: 直接イベント購読したい際に利用するクライアントクラス（`usePushChannel.ts`についても内部でこのクラスを利用している、一度だけSSEでデータを受信したい場合などにも利用）
  - `src/renderer/lib/error.ts`: Renderer側で利用するエラーの定義
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
- renderer側のコードのテストは`src/__tests__/renderer/`に配置
- main側のコードのテストは`src/__tests__/main/`に配
- 外部ライブラリとの結合をテストする場合はできるだけ実際のライブラリを使用すること
  - 実際のライブラリの利用が難しい場合はモックを利用すること
- renderer側テストの場合、Electron IPC通信はモックを利用すること
  - この場合のモックの実装は`src/__tests__/renderer/test-utils/mockElectronHandler.ts`に集約させること
- 下記の観点からテストを作成すること
  - ビジネス的な観点(ブラックボックステスト)
    - 正常系
    - 異常系
  - 技術的な観点(ホワイトボックステスト)
    - 正常系
    - 異常系
- テストに関連するプロダクトコードのカバレッジ(分岐カバレッジ)を100%にすること
- テストは古典派的なスタイルで記述すること
  - つまり、単体テストはクラス単位ではなく、一つの振る舞い単位で記述すること
  - また、最終的にMainプロセスの処理を（IPC通信にて）呼び出す場合は、モック化したIPC通信の処理を正しく呼び出せているかアサーションすること
- テストの説明は日本語で記述すること
  - テストの説明は、何をテストしているのか、どのような条件でテストが行われるのかを明確に記述すること
- テストの書き方で不明点があれば次のディレクトリ配下のテストコードを参考にすること
  - src/__tests__/renderer

## 実装上の注意
- Mastraについては実装する際はまずMCPでドキュメントや実装例を参考にしてから正確な情報やベストプラクティスに基づいてコーディングすること
- Mastra workflowの各Stepの処理について既存のスタイルを踏襲すること
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
- Mainプロセスとrendererプロセス間のIPC通信（イベントpushも含む）については`src/types/ipc.ts`で型を一元管理しているので、IPC通信関連コードを実装する際はまずこのファイルを修正して型安全に進めること
- MainプロセスでのIPC処理について、`src/main.ts`のhandleIpcにてエラーを一元管理しているため、IPCハンドラ内のサービスロジックにおいては基本的にはエラーをtry-catchしてハンドリングする必要はない
  - ただし、ユーザにエラーメッセージを通知する必要がある場合は適切なエラーハンドリングの下、`src/mian/lib/error.ts`にて提供されているAppErrorをthrowすること
- フロントエンドから外部（IPC）通信する場合は`src/renderer/service/~Api.ts`を経由すること
  - 新規にサービスクラスを作成する場合は既存ロジックを参考にして作成すること
- サーバからイベントをpushする際は`src/main/lib/eventPayloadHelper.ts`を利用すること
- フロントエンドでイベントを購読する際は`usePushChannel`もしくは`ElectronPushClient`を利用すること
  - コンポーネントで常にSSEの通信を張ってデータを取得したい場合は`usePushChannel`を、一時的にSSEの通信を貼りたい場合は`ElectronPushClient`を利用
- フロントエンドでエラーメッセージを表示する(addAlertで出す想定)場合はcatchしたエラーを`src/renderer/lib/error.ts`で定義しているgetSafeErrorMessage関数に適用してエラーメッセージを取り出すこと
- このアプリでは基本的にエラーメッセージは独自例外(`src/renderer/lib/error.ts`,`src/main/lib/error.ts`)をthrowしないとユーザにエラーメッセージが表示されないため、注意すること
- DB用の型(`src/adapter/db/drizzle/schema.ts`)とシステム内部で利用する型（ドメイン型）(`src/types`)は将来の保守性や移植性を考慮して適切に分離し、これらの差分はrepositoryで吸収すること
- テストについては指示されない限り、実行も修正もしなくてよい
- DBマイグレーションの実行は指示されない限り不要
- 適宜調査や実装の際に必要あればcodex mcpを活用すること
- 新規追加した部分については型エラーが出ないようにすること

## 依頼中タスク
- テストの強化
  - 既存テストの修復: 完了
    - しばらく前に大規模リファクタリングをしたことをきっかけにテストが壊れているので、修復する
    - 既存テストは以下
      - `src/__tests__/renderer/chatComponent.test.tsx`
      - `src/__tests__/renderer/SettingsModal.test.tsx`
      - `src/__tests__/renderer/Sidebar.test.tsx`
      - `src/__tests__/renderer/SourceListModal.test.tsx`
  - 新規テスト追加: 完了
    - renderer側
      - レビュー機能関連コンポーネントのテスト追加
        - レビュー本画面のテスト
          - チェックリスト抽出
          - レビュー実行
          - レビュー質問
        - レビューサイドバーのテスト
          - `src/__tests__/renderer/Sidebar.test.tsx`に追加
    - main側: 実施中
      - mastra workflowの処理: 実施中
        - テスト作成時の注意
          - workflow(ネストしている場合は最上位workflow)の振る舞いについてテストをすること
            - 各step毎に処理を実行するのが限りなく困難なため
            - workflow実行方法は既存の呼び出し方法を参考にすること
            - 各stepや、step間のmap処理など網羅的に検証できるようにすること
            - 関連コードを十分に確認してから、網羅的なテストケースを作成し、実装すること
            - 外部通信(DB, AI API, イベントpush、ファイルキャッシュ処理)はモック化すること
            - テキスト抽出処理(`src/main/lib/fileExtractor.ts`)はモック化すること
            - workflowの実行結果の確認については`src/mastra/lib/workflowUtils.ts`の`checkWorkflowResult`を利用すること
            - 例外がthrowされるパターンを検証する場合は以下のようにアプリ専用エラー(AppError)を利用すること
            ```
            internalError({
              expose: true,
              messageCode: 'PLAIN_MESSAGE',
              messageParams: { message: 'テストエラー' },
            }),
            ```
            - コンテキスト長エラーによりドキュメントを分割する処理が発生する場合があるが、その場合のモックの作成方法等についてはドキュメントレビュー実行workflowのテストケースを参考にすること
            - 各モックの使い方や例外をthrowするテストの作成方法については既存のworkflowテストを参考にすること
        - チェックリスト抽出(`src/mastra/workflows/sourceReview/checklistExtraction.ts`): 完了
          - チェックリストドキュメント
          - 一般ドキュメント
        - ドキュメントレビュー実行(`src/mastra/workflows/sourceReview/executeReview/index.ts`): 完了
        - チャット質問(`src/mastra/workflows/reviewChat/researchDocument/index.ts`): 完了
        - ソース登録(`src/mastra/workflows/sourceRegistration/sourceRegistration.ts`)

## 依頼中タスクの注意点
- テストを修正した後は必ず、テストを実行して成功するかどうか確かめてください
- テスト実行にはかなりの時間がかかるので、コンテキスト節約等の工夫をしてください
