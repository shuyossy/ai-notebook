// メモリ設定などelectron-storeから読み込む
// そのためmain.tsではelectron-storeの初期化後に動的インポートで遅延ロードする
// @ts-ignore
import { Mastra } from '@mastra/core';
// @ts-ignore
import { PinoLogger } from '@mastra/loggers';
// @ts-ignore
import { FileTransport } from '@mastra/loggers/file';
import { orchestrator } from './agents/orchestrator';
import { documentExpertAgent } from './agents/toolAgents';
import {
  summarizeSourceAgent,
  summarizeTopicAgent,
  checklistExtractionAgent,
  generalDocumentChecklistAgent,
  classifyCategoryAgent,
  reviewExecuteAgent,
  largeDocumentReviewExecuteAgent,
  topicExtractionAgent,
  topicChecklistAgent,
  reviewDocumentSummarizationAgent,
  reviewCheckReviewReadinessFirstRunAgent,
  reviewCheckReviewReadinessSubsequentRunAgent,
  reviewAnswerQuestionAgent,
} from './agents/workflowAgents';
import { sourceRegistrationWorkflow } from './workflows/sourceRegistration/sourceRegistration';
import { checklistExtractionWorkflow } from './workflows/sourceReview/checklistExtraction';
import { executeReviewWorkflow } from './workflows/sourceReview/executeReview';
import fs from 'fs';
import path from 'path';
import { getLogLevel } from '@/main/lib/logger';
import { getCustomAppDataDir } from '@/main/main';

const logDir = getCustomAppDataDir();
// ログファイルの保存先ディレクトリを設定
const logFilePath = path.join(logDir, 'ai.log');
console.log(`AIログファイルの保存先: ${logFilePath}`);

// --- ログディレクトリとファイルの初期化処理 ---
try {
  // ディレクトリが存在しなければ作成（再帰的に作成可能）
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  if (fs.existsSync(logFilePath)) {
    // 存在する場合は削除
    fs.unlinkSync(logFilePath);
  }

  // 空ファイルを作成（存在しない場合でも touch 的に作れる）
  fs.writeFileSync(logFilePath, '');
} catch (err) {
  console.error('ログファイル初期化に失敗:', err);
}


// ロガーの作成
export const logger = new PinoLogger({
  name: 'AIKATA',
  level: getLogLevel(),
  transports: { file: new FileTransport({ path: logFilePath }) },
});

export const mastra: Mastra = new Mastra({
  agents: {
    orchestrator,
    documentExpertAgent,
    summarizeSourceAgent,
    summarizeTopicAgent,
    checklistExtractionAgent,
    generalDocumentChecklistAgent,
    classifyCategoryAgent,
    reviewExecuteAgent,
    largeDocumentReviewExecuteAgent,
    topicExtractionAgent,
    topicChecklistAgent,
    reviewDocumentSummarizationAgent,
    reviewCheckReviewReadinessFirstRunAgent,
    reviewCheckReviewReadinessSubsequentRunAgent,
    reviewAnswerQuestionAgent,
  },
  workflows: {
    sourceRegistrationWorkflow,
    checklistExtractionWorkflow,
    executeReviewWorkflow,
  },
  logger,
});
