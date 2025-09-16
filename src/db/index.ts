import { app } from 'electron';
import { join } from 'path';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';
import { getStore } from '../main/store';
import { toAbsoluteFileURL } from '../main/lib/util';

// データベースの型定義
type Database = LibSQLDatabase<typeof schema>;

// データベース接続とORMインスタンスの作成
const initializeDatabase = async () => {
  // packaged時は ASAR 内 resources/app.asar/migrations
  const migrationsPath = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'drizzle', 'migrations')
    : join(__dirname, '..', '..', 'drizzle', 'migrations');
  console.log('migrationsPath', migrationsPath);

  // ストアからデータベースの設定を取得
  const store = getStore();

  // データベース接続クライアントを作成
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url: toAbsoluteFileURL(store.get('database').dir, 'source.db'),
  });

  // drizzle-ormインスタンス
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: migrationsPath,
  });

  return db;
};

// メインプロセスでのみデータベースを初期化
let dbInstance: Database | undefined;

// データベースインスタンスを取得する関数
const getDb = async (): Promise<Database> => {
  if (!dbInstance) {
    dbInstance = await initializeDatabase();
  }
  return dbInstance!;
};

// データベースモジュールのデフォルトエクスポート
export default getDb;
