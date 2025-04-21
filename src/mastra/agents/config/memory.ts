import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/core/storage/libsql';
import { URL } from 'url';
import { getStore } from '../../../main/store';

// メモリオプションの型定義
export interface MemoryConfig {
  lastMessages?: number;
  semanticRecall?: boolean;
}

// メモリインスタンスの作成
export const createMemory = (config: MemoryConfig = {}): Memory => {
  const store = getStore();
  const dbDir = store.get('database.dir');

  if (!dbDir) {
    throw new Error('データベースディレクトリが設定されていません。');
  }

  const options = {
    lastMessages: config.lastMessages ?? 40,
    semanticRecall: config.semanticRecall ?? false,
  };

  return new Memory({
    options,
    storage: new LibSQLStore({
      config: {
        url: new URL(`file:${dbDir}/memory.db`).toString(),
      },
    }),
  });
};
