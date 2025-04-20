import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import 'dotenv/config';
import { URL } from 'url'

// データベースURLが設定されていなければエラー
if (!process.env.DATABASE_DIR) {
  throw new Error('DATABASE_DIR環境変数が設定されていません');
}

// データベース接続クライアントを作成
const client = createClient({
  url: new URL('source.db', process.env.DATABASE_DIR).href,
});

// Drizzle ORMインスタンスを作成
export const db = drizzle(client, { schema });