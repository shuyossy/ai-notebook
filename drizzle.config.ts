import type { Config } from 'drizzle-kit';
import 'dotenv/config';
import { toAbsoluteFileURL } from './src/main/lib/util';

if (!process.env.DATABASE_DIR) {
  throw new Error('DATABASE_DIR環境変数が設定されていません');
}

console.log(
  'DATABASE_URL',
  toAbsoluteFileURL(process.env.DATABASE_DIR, 'source.db'),
);

export default {
  schema: './src/adapter/db/drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: toAbsoluteFileURL(process.env.DATABASE_DIR, 'source.db'),
  },
} satisfies Config;
