import { ipcMain } from 'electron';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getStore } from '../main/store';

// データベースの型定義
type Database = LibSQLDatabase<typeof schema>;

// データベース接続とORMインスタンスの作成
const initializeDatabase = async () => {
  // ストアからデータベースの設定を取得
  const store = getStore();

  // データベース接続クライアントを作成
  const { createClient } = await import('@libsql/client');

  const client = createClient({
    url: new URL('source.db', store.get('database.dir')).href,
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

// データベース操作用のIPCハンドラーを設定
export const initializeDb = async () => {
  const db = await getDb();
  ipcMain.handle('db-operation', async (event, { type, payload }) => {
    try {
      switch (type) {
        case 'select': {
          const table = schema[payload.table as keyof typeof schema];
          return await db.select().from(table);
        }
        case 'insert': {
          const table = schema[payload.table as keyof typeof schema];
          return await db.insert(table).values(payload.data);
        }
        case 'update': {
          const table = schema[payload.table as keyof typeof schema];
          return await db.update(table).set(payload.data).where(payload.where);
        }
        case 'delete': {
          const table = schema[payload.table as keyof typeof schema];
          return await db.delete(table).where(payload.where);
        }
        default:
          throw new Error(`Unsupported operation type: ${type}`);
      }
    } catch (error) {
      console.error('Database operation failed:', error);
      throw error;
    }
  });
};

// データベースモジュールのデフォルトエクスポート
export default getDb;
