// workflowで利用するエージェントをまとめたクラス
// @ts-ignore
import { Agent } from '@mastra/core/agent';
// eslint-disable-next-line import/no-cycle
import {
  SOURCE_ANALYSIS_SYSTEM_PROMPT,
  EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT,
  getChecklistExtractionPrompt,
  getGeneralDocumentChecklistPrompt,
  getTopicExtractionPrompt,
  getTopicChecklistCreationPrompt,
  // getChecklistIntegrationPrompt,
  getChecklistRefinementPrompt,
  getChecklistCategolizePrompt,
  getDocumentReviewExecutionPrompt,
  getIndividualDocumentReviewPrompt,
  getConsolidateReviewPrompt,
  getReviewChatPlanningPrompt,
  getReviewChatResearchPrompt,
  getReviewChatAnswerPrompt,
} from './prompts';
import { getModel } from './model';
import { BaseRuntimeContext } from './types';
import type { CustomEvaluationSettings } from '@/types';

export type ChecklistExtractionAgentRuntimeContext = BaseRuntimeContext & {
  extractedItems: string[];
  documentFormatContext?: string;
};

export type ClassifyCategoryAgentRuntimeContext = BaseRuntimeContext & {
  targetChecklistCount: number;
};

export type ReviewExecuteAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: CustomEvaluationSettings;
  documentFormatContext?: string;
};

export type TopicExtractionAgentRuntimeContext = BaseRuntimeContext & {
  checklistRequirements?: string;
  documentFormatContext?: string;
};

export type TopicChecklistAgentRuntimeContext = BaseRuntimeContext & {
  topic: { title: string };
  checklistRequirements?: string;
  documentFormatContext?: string;
};

export type ChecklistRefinementAgentRuntimeContext = BaseRuntimeContext & {
  checklistRequirements?: string; // ユーザのチェックリスト生成要件
};

export type IndividualDocumentReviewAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
  documentFormatContext?: string;
};

export type ConsolidateReviewAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: CustomEvaluationSettings;
};

// レビューチャット用エージェント
export type ReviewChatPlanningAgentRuntimeContext = BaseRuntimeContext & {
  availableDocuments: { id: number; fileName: string }[];
  checklistInfo: string; // チェックリスト情報のテキスト
  reviewMode: 'large' | 'small'; // レビュー方式（大量レビュー/少量レビュー）
};

export type ReviewChatResearchAgentRuntimeContext = BaseRuntimeContext & {
  researchContent: string; // 調査内容
  totalChunks: number; // ドキュメントの総チャンク数
  chunkIndex: number; // 現在のチャンクインデックス
  fileName: string; // ドキュメント名
  checklistInfo: string; // チェックリスト情報（内容とレビュー結果）
  userQuestion: string; // ユーザからの質問
  reasoning?: string; // 調査計画の理由
  reviewMode: 'large' | 'small'; // レビュー方式（大量レビュー/少量レビュー）
  documentFormatContext?: string;
};

export type ReviewChatAnswerAgentRuntimeContext = BaseRuntimeContext & {
  userQuestion: string; // ユーザからの質問
  checklistInfo: string; // チェックリスト情報のテキスト
  reviewMode: 'large' | 'small'; // レビュー方式（大量レビュー/少量レビュー）
};

export const summarizeSourceAgent = new Agent({
  name: 'summarizeSourceAgent',
  instructions: SOURCE_ANALYSIS_SYSTEM_PROMPT,
  model: getModel,
});

export const summarizeTopicAgent = new Agent({
  name: 'summarizeTopicAgent',
  instructions: EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT,
  model: getModel,
});

export const checklistExtractionAgent = new Agent({
  name: 'checklistExtractionAgent',
  instructions: getChecklistExtractionPrompt,
  model: getModel,
});

export const generalDocumentChecklistAgent = new Agent({
  name: 'generalDocumentChecklistAgent',
  instructions: getGeneralDocumentChecklistPrompt,
  model: getModel,
});

export const classifyCategoryAgent = new Agent({
  name: 'classifyCategoryAgent',
  instructions: getChecklistCategolizePrompt,
  model: getModel,
});

export const reviewExecuteAgent = new Agent({
  name: 'reviewExecuteAgent',
  instructions: getDocumentReviewExecutionPrompt,
  model: getModel,
});

export const topicExtractionAgent = new Agent({
  name: 'topicExtractionAgent',
  instructions: getTopicExtractionPrompt,
  model: getModel,
});

export const topicChecklistAgent = new Agent({
  name: 'topicChecklistAgent',
  instructions: getTopicChecklistCreationPrompt,
  model: getModel,
});

// export const checklistIntegrationAgent = new Agent({
//   name: 'checklistIntegrationAgent',
//   instructions: getChecklistIntegrationPrompt,
//   model: getModel,
// });

// チェックリストブラッシュアップ用エージェント
export const checklistRefinementAgent = new Agent({
  name: 'checklistRefinementAgent',
  instructions: getChecklistRefinementPrompt,
  model: getModel,
});

// 個別ドキュメントレビュー用エージェント（効率化版）
export const individualDocumentReviewAgent = new Agent({
  name: 'individualDocumentReviewAgent',
  instructions: getIndividualDocumentReviewPrompt,
  model: getModel,
});

// レビュー結果統合用エージェント
export const consolidateReviewAgent = new Agent({
  name: 'consolidateReviewAgent',
  instructions: getConsolidateReviewPrompt,
  model: getModel,
});

export const reviewChatPlanningAgent = new Agent({
  name: 'reviewChatPlanningAgent',
  instructions: getReviewChatPlanningPrompt,
  model: getModel,
});

export const reviewChatResearchAgent = new Agent({
  name: 'reviewChatResearchAgent',
  instructions: getReviewChatResearchPrompt,
  model: getModel,
});

export const reviewChatAnswerAgent = new Agent({
  name: 'reviewChatAnswerAgent',
  instructions: getReviewChatAnswerPrompt,
  model: getModel,
});
