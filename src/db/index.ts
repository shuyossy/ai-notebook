import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getStore } from '../main/store';
import { toAbsoluteFileURL } from '../main/utils/util';

// データベースの型定義
type Database = LibSQLDatabase<typeof schema>;

// データベース接続とORMインスタンスの作成
const initializeDatabase = async () => {
  // ストアからデータベースの設定を取得
  const store = getStore();

  // データベース接続クライアントを作成
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url: toAbsoluteFileURL(store.get('database').dir, 'source.db'),
  });

  // Drizzle ORMインスタンスを作成
  return drizzle(client, { schema });
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
