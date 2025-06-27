// メモリ設定などelectron-storeから読み込む
// そのためmain.tsではelectron-storeの初期化後に動的インポートで遅延ロードする
import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { orchestrator } from './agents/orchestrator';
import { documentExpertAgent } from './agents/toolAgents';
import {
  summarizeSourceAgent,
  summarizeTopicAgent,
  checklistExtractionAgent,
  classifyCategoryAgent,
  reviewExecuteAgent,
} from './agents/workflowAgents';
import { sourceRegistrationWorkflow } from './workflows/sourceRegistration';
import { checklistExtractionWorkflow } from './workflows/sourceReview/checklistExtraction';
import { reviewExecutionWorkflow } from './workflows/sourceReview/reviewExecution';

// 開発環境か本番環境かによってログレベルを切り替え
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// ロガーの作成
const logger = createLogger({
  name: 'AIKATA',
  level: logLevel,
});

export const mastra: Mastra = new Mastra({
  agents: {
    orchestrator,
    documentExpertAgent,
    summarizeSourceAgent,
    summarizeTopicAgent,
    checklistExtractionAgent,
    classifyCategoryAgent,
    reviewExecuteAgent,
  },
  workflows: {
    sourceRegistrationWorkflow,
    checklistExtractionWorkflow,
    reviewExecutionWorkflow,
  },
  logger,
});
