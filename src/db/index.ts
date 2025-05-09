import { app } from 'electron';
import { join } from 'path';
// better-sqlite3 をインポート
import Database from 'better-sqlite3';
// better-sqlite3 用の Drizzle ドライバをインポート
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
// マイグレーション実行用の関数をインポート
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { getStore } from '../main/store';

// Drizzle ORM のデータベース型定義
type DatabaseType = BetterSQLite3Database<typeof schema>;

/**
 * データベース初期化処理
 */
const initializeDatabase = async (): Promise<DatabaseType> => {
  // packaged 時と開発時でマイグレーションパスを切り替え
  const migrationsPath = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'drizzle', 'migrations')
    : join(__dirname, '..', '..', 'drizzle', 'migrations');
  console.log('migrationsPath', migrationsPath);

  // ストアから DB ディレクトリを取得
  const store = getStore();
  const dbDir = store.get('database').dir as string;
  // SQLite ファイルへのパス
  const dbPath = join(dbDir, 'source.db');

  // better-sqlite3 クライアントを作成
  const sqliteClient = new Database(dbPath);
  // Drizzle ORM インスタンスを生成
  const db = drizzle({ client: sqliteClient, schema }); // 

  try {
    // テーブルが存在するか簡易チェック
    await db.execute('SELECT 1 FROM sources LIMIT 1');
    await db.execute('SELECT 1 FROM topics LIMIT 1');
  } catch (error) {
    // 存在しなければマイグレーションを実行
    console.log('データベースが存在しないため、初期化を実行します');
    await migrate(db, {
      migrationsFolder: migrationsPath,
    });
    console.log('マイグレーションが完了しました');
  }

  return db;
};

// シングルトンで DB インスタンスを保持
let dbInstance: DatabaseType | undefined;

/**
 * 初期化済みの Drizzle ORM インスタンスを返却
 */
export const getDb = async (): Promise<DatabaseType> => {
  if (!dbInstance) {
    dbInstance = await initializeDatabase();
  }
  return dbInstance!;
};

/**
 * DB を再初期化してマイグレーションし直す
 */
export const refreshDb = async (): Promise<void> => {
  dbInstance = undefined;
  dbInstance = await initializeDatabase();
};

export default getDb;
