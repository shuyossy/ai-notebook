# アーキテクチャ詳細

## レイヤー構成

### 1. Electronプロセス層
- **メインプロセス** (`src/main/main.ts`): アプリケーションエントリーポイント、IPC通信管理
- **レンダラープロセス** (`src/renderer/`): Reactベースフロントエンド
- **プリロードスクリプト** (`src/main/preload/`): セキュアなIPC API公開

### 2. フロントエンド層（React）
```
src/renderer/
├── components/          # UIコンポーネント
│   ├── sidebar/        # サイドバー（機能切り替え）
│   ├── chat/           # チャット機能UI
│   ├── review/         # レビュー機能UI
│   └── common/         # 共通コンポーネント
├── hooks/              # カスタムフック
├── service/            # フロントエンドサービス
└── stores/            # Zustand状態管理
```

### 3. Mastraフレームワーク統合層
```
src/mastra/
├── agents/             # AIエージェント定義
│   ├── orchestrator.ts # 汎用チャットエージェント
│   └── prompts.ts      # プロンプト定義集約
├── tools/              # 外部システム統合
│   ├── gitlab/         # GitLab API統合
│   ├── redmine/        # Redmine API統合
│   ├── mcp/            # MCP連携
│   └── sourcesTools.ts # ドキュメント検索
├── workflows/          # 複雑タスク自動化
│   ├── sourceRegistration/ # ドキュメント登録WF
│   └── sourceReview/       # レビュー実行WF
└── memory/            # メモリ・フィルタリング
```

### 4. データベース層
```
src/db/
├── schema.ts          # Drizzleテーブル定義
└── repository/        # データアクセス層
```

### 5. サービス層
```
src/main/service/
├── ChatService        # チャット機能ビジネスロジック
├── ReviewService      # レビュー機能ビジネスロジック
└── SettingsService    # 設定管理
```

## IPC通信アーキテクチャ
- **チャネル定義**: `src/main/types/ipc.ts`で型安全管理
- **ハンドラー**: `src/main/main.ts`で集約定義
- **プリロード**: セキュアなAPI公開層

## データフロー

### チャット機能
1. UI → IPC → ChatService → Mastra Agent → 外部API/Tools → レスポンス
2. リアルタイム更新: IPC eventを使用

### レビュー機能  
1. UI → IPC → ReviewService → Mastra Workflow → チェックリスト抽出/レビュー実行
2. 段階的処理: Workflowのステップ管理

### ドキュメント管理
1. ファイル登録 → テキスト抽出（fileExtractor） → DBキャッシュ → 検索可能化

## 設定管理
- **electron-store**: 永続化設定ストレージ
- **環境分離**: 開発/本番環境の設定分離
- **リアクティブ**: 設定変更の即座反映