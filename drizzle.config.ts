import type { Config } from 'drizzle-kit';
import 'dotenv/config';

if (!process.env.DATABASE_DIR) {
  throw new Error('DATABASE_URL環境変数が設定されていません');
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: new URL('source.db', process.env.DATABASE_DIR).href,
  },
} satisfies Config;
