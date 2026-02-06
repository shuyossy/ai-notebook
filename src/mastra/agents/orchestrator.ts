// @ts-ignore
import { Agent } from '@mastra/core/agent';
// @ts-ignore
import { Memory } from '@mastra/memory';
// @ts-ignore
import { TokenLimiter } from '@mastra/memory/processors';
// @ts-ignore
import { LibSQLStore } from '@mastra/libsql';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { getStore } from '@/adapter/db/electron-store/store';
import { getOrchestratorSystemPrompt } from './prompts';
import { getModel } from './model';
import { isPathExists, toAbsoluteFileURL } from '@/main/lib/util';
import { CustomToolCallFilter } from '../memory/filter/customToolCallFilter';
import { BaseRuntimeContext } from './types';
import type { AgentToolStatus } from '@/types';
import type { RedmineBaseInfo } from '../tools/redmine/types';
import { internalError } from '@/main/lib/error';
import { isValidModelName, ModelName } from '@/config/modelConfig';

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

export const getMemory = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<BaseRuntimeContext>;
}) => {
  const apiConfig = runtimeContext.get('model');

  if (!apiConfig || !apiConfig.key || !apiConfig.url || !apiConfig.modelName) {
    throw internalError({
      expose: true,
      messageCode: 'VALIDATION_ERROR',
      messageParams: {
        detail:
          'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      },
    });
  }

  // モデル名の検証
  if (!isValidModelName(apiConfig.modelName)) {
    throw internalError({
      expose: true,
      messageCode: 'VALIDATION_ERROR',
      messageParams: {
        detail: `無効なモデル名です: ${apiConfig.modelName}`,
      },
    });
  }

  const modelName: ModelName = apiConfig.modelName;
  const tokenLimit = (() => {
    switch (modelName) {
      case 'gpt-4.1-mini':
        return 4000;
      case 'gpt-4o':
        return 4000;
      case 'gpt-5':
        return 4000;
      default: {
        // TypeScriptによる網羅性チェック
        const _exhaustiveCheck: never = modelName;
        throw internalError({
          expose: true,
          messageCode: 'VALIDATION_ERROR',
          messageParams: {
            detail: `未対応のモデル名です: ${_exhaustiveCheck}`,
          },
        });
      }
    }
  })();

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
      new TokenLimiter(tokenLimit), // トークン上限値-(レスポンス＋ツールコール)
    ],
  });
  return memory;
};

export const orchestrator = new Agent({
  name: 'orchestrator',
  instructions: getOrchestratorSystemPrompt,
  model: getModel,
  memory: getMemory,
});
