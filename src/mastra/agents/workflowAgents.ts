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
  getChecklistCategolizePrompt,
  getDocumentReviewExecutionPrompt,
  getIndividualDocumentReviewPrompt,
  getConsolidateReviewPrompt,
} from './prompts';
import { getOpenAICompatibleModel } from './model/openAICompatible';
import { BaseRuntimeContext } from './types';
import type { CustomEvaluationSettings } from '@/types';

export type ChecklistExtractionAgentRuntimeContext = BaseRuntimeContext & {
  extractedItems: string[];
};

export type ClassifyCategoryAgentRuntimeContext = BaseRuntimeContext & {
  maxChecklistsPerCategory: number;
  maxCategories: number;
};

export type ReviewExecuteAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: CustomEvaluationSettings;
};

export type TopicExtractionAgentRuntimeContext = BaseRuntimeContext & {
  checklistRequirements?: string;
};

export type TopicChecklistAgentRuntimeContext = BaseRuntimeContext & {
  topic: { title: string };
  checklistRequirements?: string;
};

export type ReviewCheckReviewReadinessFirstRunAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
};

export type ReviewCheckReviewReadinessSubsequentAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  priorQnA: { documentId: string; documentName: string; qna: { question: string; answer: string }[] }[];
};

export type ReviewAnswerQuestionAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
};

export type IndividualDocumentReviewAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
};

export type ConsolidateReviewAgentRuntimeContext = BaseRuntimeContext & {
  checklistItems: { id: number; content: string }[];
  additionalInstructions?: string;
  commentFormat?: string;
  evaluationSettings?: CustomEvaluationSettings;
};

export const summarizeSourceAgent = new Agent({
  name: 'summarizeSourceAgent',
  instructions: SOURCE_ANALYSIS_SYSTEM_PROMPT,
  model: getOpenAICompatibleModel,
});

export const summarizeTopicAgent = new Agent({
  name: 'summarizeTopicAgent',
  instructions: EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT,
  model: getOpenAICompatibleModel,
});

export const checklistExtractionAgent = new Agent({
  name: 'checklistExtractionAgent',
  instructions: getChecklistExtractionPrompt,
  model: getOpenAICompatibleModel,
});

export const generalDocumentChecklistAgent = new Agent({
  name: 'generalDocumentChecklistAgent',
  instructions: getGeneralDocumentChecklistPrompt,
  model: getOpenAICompatibleModel,
});

export const classifyCategoryAgent = new Agent({
  name: 'classifyCategoryAgent',
  instructions: getChecklistCategolizePrompt,
  model: getOpenAICompatibleModel,
});

export const reviewExecuteAgent = new Agent({
  name: 'reviewExecuteAgent',
  instructions: getDocumentReviewExecutionPrompt,
  model: getOpenAICompatibleModel,
});

export const topicExtractionAgent = new Agent({
  name: 'topicExtractionAgent',
  instructions: getTopicExtractionPrompt,
  model: getOpenAICompatibleModel,
});

export const topicChecklistAgent = new Agent({
  name: 'topicChecklistAgent',
  instructions: getTopicChecklistCreationPrompt,
  model: getOpenAICompatibleModel,
});

// export const checklistIntegrationAgent = new Agent({
//   name: 'checklistIntegrationAgent',
//   instructions: getChecklistIntegrationPrompt,
//   model: getOpenAICompatibleModel,
// });

// 個別ドキュメントレビュー用エージェント（効率化版）
export const individualDocumentReviewAgent = new Agent({
  name: 'individualDocumentReviewAgent',
  instructions: getIndividualDocumentReviewPrompt,
  model: getOpenAICompatibleModel,
});

// レビュー結果統合用エージェント
export const consolidateReviewAgent = new Agent({
  name: 'consolidateReviewAgent',
  instructions: getConsolidateReviewPrompt,
  model: getOpenAICompatibleModel,
});
