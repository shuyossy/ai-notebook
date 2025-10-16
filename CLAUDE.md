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
      - どちらも複数ファイルを選択することができ、その場合は、複数ファイルが一つの統合ドキュメントとして認識される(よくある、本紙・別紙などのドキュメントに対応)
      - 対応可能なファイルは以下
        - word,excel,powerpoint,pdf,テキスト文書
          - テキスト抽出するか画像としてAIに送信するか選択することができる
            - 画像として送信する場合はpdfを画像化する(renderer側で画像化※main側ではcanvasが扱いづらかったため)
              - office文書についてはmain側で一度pdf化してから画像化する
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


## 依頼タスク
- ビジネス要件
  - レビュー機能利用時に、レビュー結果に対してAIとチャットできる機能を追加する
- 機能要件
  1. 1レビュー履歴に対して1つの（結合）ドキュメントのみ登録可能にする: 完了済み
    - 目的
      - AIとチャットする際に複数のドキュメントがレビュー結果として登録されているとどのドキュメントに対して回答して良いかわからなくなるため
    - 実装方針
      - DBテーブルの更新
        - `review_checklist_results`を廃止して`review_checklists`に統合
        - `review_checklist_results`のfileId,fileNameを削除して、`review_histories`にtargetDocumentName(レビュー対象の(統合)ドキュメント名のこと)として同じ役割を引き継がせる
      - ドメイン型の更新
        - ReviewChecklistResultのsourceEvaluations属性は配列ではなく、単一要素とする
        - ReviewChecklistResultのfileIdとfileNameを削除、targetDocumentNameを新規追加
        - これらに伴い既存処理の変更も必要になるので注意すること
      - サーバサイド処理更新
        - レビュー実行の開始時(`src/mastra/workflows/sourceReview/executeReview/index.ts`のステップ1テキスト抽出とカテゴリ分割の実行後のmap処理内)に、既存のレビュー結果は全て削除してから実行するように変更する
  2. レビュー実行時にアップロードしたファイル内容(抽出済みテキスト、画像データ)と、（大量ドキュメントレビューの場合は）個別レビューの結果を、後にチャットする時のために保存して取り出すことができるようにする: 完了済み
    - 実装方針
      - DBテーブルの更新
        - `review_document_chaches`テーブルの作成
          - `review_histories`と一対多の関係
          - ファイルのメタデータ(id, originalFileName(大量ドキュメントレビュー用), fileName, processMode('text' or 'image'), originalPath, cachePath,...等)を保存
        - `review_histories`テーブルに大量ドキュメントレビューか少量ドキュメントレビューかを示すフラグを追加
        - `review_largedocument_result_chaches`テーブルの作成
          - `review_document_chaches`と`review_checklists`の中間テーブル
          - 少量ドキュメントレビューの場合に、個別チェックリストに対して、個別ドキュメントをレビューするが、その際のチャンクパラメータ(チャンク総数と個別ドキュメントのチャンクインデックス)と結果を保存
      - ドメイン型の更新
        - 上記に合わせてドメイン型(`src/types/review.ts`)の新規作成が必要
        - 今後も見据えて最善のドメイン型を作成してください
      - サーバサイド処理更新
        - レビュー実行方法が大量ドキュメントレビューであったか、それとも少量ドキュメントレビューであったのか、レビュー実行時に保存できるようにする
        - ファイルのメタデータについてはDBに保存し、実態はキャッシュ用のディレクトリに保存
          - キャッシュについては以下パスに保存
            - 抽出済みテキスト`${AppDataディレクトリ}/review_chache/${レビューID}/file_cache/${id}.txt`
            - 画像データ`${AppDataディレクトリ}/review_chache/${レビューID}/file_cache/${id}/page_${インデックス値}.b64`
          - キャッシュのパスはDBに保存して、後ほどチャット機能で簡単にパスを取得できるようにする
            - processModeがtextの場合はキャッシュのパスはファイルパス(`.../${id}.txt`)になり、imageの場合はディレクトリパス(`.../${id}`)になる
          - 実際にレビューが実行された直後にレビュー結果とともにドキュメントのキャッシュを保存する
      - 実装時の注意点
        - （少量、大量）レビュー実行時の処理（コンポーネント~workflow）に影響があるので、幅広く影響を見極めること
        - DBとドメインについてはどちらも上手くrepositoryインターフェースに依存性逆転させているのでこれを利用して効率的に実装すること
  3. レビュー結果に対してAIとチャットできるようにする: 実行中
    - 実装方針
      - UI
        - チャット結果画面内(`src/renderer/components/review/ReviewChecklistSection.tsx`)にチャットを開始できるボタンを配置
          - このボタンが押下されると画面右サイドからチャット画面が出現する
            - チャット画面については`src/renderer/components/chat/ChatArea.tsx`を参考にすること(特にuseChatフックを利用する部分)
        - チャットに関するコンポーネントは最大限既存のものを活用する（`src/renderer/components/chat`） 
        - チャット内容は永続化する必要はなく、レビューIDを切り替えたらチャット内容は初期化される
        - チャット入力欄で「@」と入力するとどのチェックリストに対して質問をするかスクロール形式で選ぶことができる
          - 一般的にAIコーディングエディタ内で任意のファイルを参照させることができるようにするための用途で実装されているものと同じ形式と理解して実装してください
          - 対象のチェックリストについてはuseStateで状態管理しておく
            - 「@チェックリストA」のような完全な状態から「@チェックリスト」のように一文字でも欠けた状態になった場合は、状態管理から外す
            - 管理下にあるチェックリストについてはチャット入力欄内の「@チェックリストA」を青字で表示する(これも一般的なAIコーディングエディタでよくある実装方法です)
            - 複数のチェックリストを登録可能
      - サーバサイド処理更新
        - AIチャット機能実装
          - mastra workflowとして実装
            - workflowは以下のようなステップで構築する(大量ドキュメントレビュー、少量ドキュメントレビューで区別しない)
              1. AIにユーザからの質問と対象のチェックリストを与えて、調査対象ドキュメントとその調査内容のペアの配列を出力させる
                - AI処理詳細
                  - システムプロンプト
                    - 提示する内容
                      - @で指定されたチェックリストの内容とレビュー結果（大量レビューの場合は個別のレビュー結果も） 
                      - ドキュメントキャッシュ内容(id, FileName)
                        - 出力時に質問対象ドキュメントを指定できるようにするため
                      - AIの役割：ユーザから与えられたチェックリスト結果と質問に対して、最終的に良い回答ができるように、調査すべきドキュメントとその調査内容を出力すること
                  - ユーザコンテキスト
                      - ユーザからの質問
                  - 出力内容
                  ```
                  {
                    documentId: string # review_document_cachesテーブルのId
                    researchContent: string
                  }[]
                  ```
              2. 1で指定されたドキュメント毎に以下ステップを並列実行(foreach)
                - `review_largedocument_result_chaches`テーブル内のドキュメントキャッシュIDが一致するレコードからtotalChunksの最大値を取得
                - 以下をループ(dountil)※`src/mastra/workflows/sourceReview/executeReview/largeDocumentReview/index.ts`の`individualDocumentReviewWorkflow`を参考にすること
                  - ドキュメントをtotalChunks分のチャンクに分解して(`src/mastra/workflows/sourceReview/lib.ts`を利用)、それぞれに対して以下を並列実行(foreach)
                    - AIに調査対象ドキュメント(reviewRepository#getReviewDocumentCacheByDocumentIdを利用して取得)と調査内容を与えて、調査結果を出力する
                  - 並列処理の結果一つでもコンテキスト長エラーになっていた場合は、チャンク数を一つ増やして処理をループする（全てsuccessの場合はループ終了）
              3. 2の調査結果を全てAIに与えて、最終的にユーザ返す質問内容を出力する
            - workflowの最終的な処理結果はチャット機能と同様にAI SDK形式のチャンクをイベントpushで送信する(chatService#generateを参照)
    - 実装時の注意点
      - workflowの実装方法は大量ドキュメントレビュー実行時のworkflowを参考にすること
      - AIに与えるシステムプロンプトも大量ドキュメントレビュー実行時ものもを参考にすること(なぜその処理を実行させたいのか、背景もうまく伝えられるようにして欲しい)
  - 改善依頼
    - レビュー質問workflow内のドキュメント調査ステップにて、ドキュメントが画像の場合に

### タスク実装時の注意点
- 依頼タスクの全ての手順を理解した上で、最適な実装をすること
- **ドキュメントレビュー機能、レビュー質問機能の全て**を正しく理解した上で実装すること
- プロンプト作成の際はベストプラクティスに沿って効果的なプロンプトにすること
- ユーザが直感的に操作できて、尚且つ一般的なUIにすること
  - 美しく、ユーザへの配慮がしっかりとできているUIにすること
