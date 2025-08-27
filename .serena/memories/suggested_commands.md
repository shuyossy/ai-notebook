# 推奨コマンド

## 開発環境
```bash
# 開発サーバー起動
npm start

# Mastra開発モード
npm run mastra:dev
```

## 品質管理
```bash
# TypeScript型チェック
npm run check

# ESLint実行（全体）
npm run lint

# ESLint修正（全体）
npm run lint:fix

# ESLintバックエンドのみ
npm run lint:backend

# ESLintバックエンド修正
npm run lint:backend:fix

# Prettier実行
npm run format

# テスト実行
npm test
```

## データベース関連
```bash
# スキーマ生成
npm run db:generate

# DBプッシュ
npm run db:push

# マイグレーション（生成+プッシュ）
npm run db:migrate

# DBセットアップ
npm run db:prepare

# Drizzle Studio起動
npm run db:studio
```

## ビルド・デプロイ
```bash
# プロダクションビルド
npm run build

# Electronパッケージ作成
npm run package
```

## システムユーティリティ（macOS）
```bash
# ファイル一覧表示
ls -la

# ディレクトリ移動
cd [path]

# ファイル検索
find . -name "*.ts" -type f

# テキスト検索
grep -r "search_term" src/

# Git操作
git status
git add .
git commit -m "message"
```