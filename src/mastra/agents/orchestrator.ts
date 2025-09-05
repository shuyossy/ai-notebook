// @ts-ignore
import { Agent } from '@mastra/core/agent';
// @ts-ignore
import { Memory } from '@mastra/memory';
// @ts-ignore
import { TokenLimiter } from '@mastra/memory/processors';
// @ts-ignore
import { LibSQLStore } from '@mastra/libsql';
import { getStore } from '@/main/store';
import { getOrchestratorSystemPrompt } from './prompts';
import { getOpenAICompatibleModel } from './model/openAICompatible';
import { isPathExists, toAbsoluteFileURL } from '@/main/lib/util';
import { CustomToolCallFilter } from '../memory/filter/customToolCallFilter';
import { BaseRuntimeContext } from './types';
import type { AgentToolStatus } from '@/types';
import type { RedmineBaseInfo } from '../tools/redmine/types';

// orchestrator用のRuntimeContext
export type OrchestratorRuntimeContext = BaseRuntimeContext & {
  toolStatus: AgentToolStatus;
  documentQuery?: {
    registeredDocuments: string;
  };
  redmine?: {
    endpoint: string;
    basicInfo: RedmineBaseInfo;
  };
  gitlab?: {
    endpoint: string;
  };
  additionalSystemPrompt?: string;
};

const store = getStore();
let dbDir = store.get('database').dir;
let dbDirExistsFlag = false;
try {
  if (dbDir && dbDir.trim() !== '') {
    dbDirExistsFlag = isPathExists(dbDir);
  }
} catch (error) {
  console.error(
    `データベース保存フォルダの存在確認中にエラーが発生しました: ${error}`,
  );
  dbDirExistsFlag = false;
}
if (!dbDirExistsFlag) {
  console.warn(
    'データベース保存フォルダが設定されていません。カレントフォルダを使用します。',
  );
  dbDir = './';
}

const memory = new Memory({
  storage: new LibSQLStore({
    url: toAbsoluteFileURL(dbDir, 'memory.db'),
  }),
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      template: `
# Session Status
- Current Main Task: {task}

# Task Management
- Progress: {progress}
- Action Steps:
  - {Step 1}
  - {Step 2}
  - ...

## Response Notes
- {Note 1}
- {Note 2}
- ...
`,
    },
    threads: {
      generateTitle: true,
    },
  },
  processors: [
    new CustomToolCallFilter({
      exclude: [
        'documentQueryTool',
        'getGitLabFileContent',
        'getGitLabRawFile',
        'getGitLabBlameFile',
      ],
    }), // 特定のツールコールを除外
    new TokenLimiter(4000), // トークン上限値-(レスポンス＋ツールコール)
  ],
});

export const orchestrator = new Agent({
  name: 'orchestrator',
  instructions: getOrchestratorSystemPrompt,
  model: getOpenAICompatibleModel,
  memory,
});
