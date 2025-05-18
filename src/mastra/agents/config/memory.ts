import { Memory } from '@mastra/memory';
import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';
import type { MemoryProcessor } from '@mastra/core';
import { openai } from '@mastra/openai'
import { LibSQLStore } from '@mastra/core/storage/libsql';
import { toAbsoluteFileURL } from '@/main/utils/util';
import { getStore } from '../../../main/store';

// メモリオプションの型定義
export interface MemoryConfig {
  tokenLimit?: number;
  excduldeTools?: string[];
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

// メモリインスタンスをキャッシュ
let memoryInstance: Memory | undefined;

// メモリインスタンスの作成・取得
export const getMemory = (config: MemoryConfig = {}): Memory => {
  if (memoryInstance) {
    return memoryInstance;
  }

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

  const memoryProcessors: MemoryProcessor[] | undefined = [];
  if (config.tokenLimit) {
    memoryProcessors.push(new TokenLimiter(config.tokenLimit));
  }
  if (config.excduldeTools) {
    memoryProcessors.push(
      new ToolCallFilter({ exclude: config.excduldeTools }),
    );
  }

  memoryInstance = new Memory({
    options,
    processors: memoryProcessors.length > 0 ? memoryProcessors : undefined,
    storage: new LibSQLStore({
      config: {
        url: toAbsoluteFileURL(dbSetting.dir, 'memory.db'),
      },
    }),
  });

  return memoryInstance;
};

// メモリインスタンスのリセット（主にテスト用）
export const resetMemory = () => {
  memoryInstance = undefined;
};
