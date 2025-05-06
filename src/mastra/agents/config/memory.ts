import { Memory } from '@mastra/memory';
import { TokenLimiter } from '@mastra/memory/processors';
import { LibSQLStore } from '@mastra/core/storage/libsql';
import { toAbsoluteFileURL } from '@/main/utils/util';
import { getStore } from '../../../main/store';

// メモリオプションの型定義
export interface MemoryConfig {
  tokenLimit?: number;
  lastMessages?: number;
  semanticRecall?: boolean;
  workingMemory?: {
    enabled: boolean;
    use?: 'text-stream' | 'tool-call';
    tmplate?: string;
  };
  threads?: {
    generateTitle: boolean;
  };
}

// メモリインスタンスの作成
export const createMemory = (config: MemoryConfig = {}): Memory => {
  const store = getStore();
  const dbSetting = store.get('database');

  if (!dbSetting.dir) {
    throw new Error('データベースディレクトリが設定されていません。');
  }

  const options = {
    lastMessages: config.lastMessages ?? 40,
    semanticRecall: config.semanticRecall ?? false,
    workingMemory: {
      enabled: config.workingMemory?.enabled ?? false,
      use: config.workingMemory?.use ?? undefined,
      template: config.workingMemory?.tmplate ?? undefined,
    },
    threads: {
      generateTitle: config.threads?.generateTitle ?? false,
    },
  };

  return new Memory({
    options,
    processors: config.tokenLimit
      ? [new TokenLimiter(config.tokenLimit)]
      : undefined,
    storage: new LibSQLStore({
      config: {
        url: toAbsoluteFileURL(dbSetting.dir, 'memory.db'),
      },
    }),
  });
};
