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
  getLargeDocumentReviewExecutionPrompt,
  REVIEW_DOCUMENT_SUMMARIZATION_SYSTEM_PROMPT,
  getReviewReadinessFirstRunPrompt,
  getReviewCheckReadinessSubsequentPrompt,
  getReviewAnswerQuestionPrompt,
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

// 大量ドキュメントレビュー専用エージェント（要約・Q&A情報に特化）
export const largeDocumentReviewExecuteAgent = new Agent({
  name: 'largeDocumentReviewExecuteAgent',
  instructions: getLargeDocumentReviewExecutionPrompt,
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

export const reviewDocumentSummarizationAgent = new Agent({
  name: 'reviewDocumentSummarizationAgent',
  instructions: REVIEW_DOCUMENT_SUMMARIZATION_SYSTEM_PROMPT,
  model: getOpenAICompatibleModel,
});

export const reviewCheckReviewReadinessFirstRunAgent = new Agent({
  name: 'reviewCheckReviewReadinessFirstRunAgent',
  instructions: getReviewReadinessFirstRunPrompt,
  model: getOpenAICompatibleModel,
});

export const reviewCheckReviewReadinessSubsequentRunAgent = new Agent({
  name: 'reviewCheckReviewReadinessSubsequentRunAgent',
  instructions: getReviewCheckReadinessSubsequentPrompt,
  model: getOpenAICompatibleModel,
});

export const reviewAnswerQuestionAgent = new Agent({
  name: 'reviewAnswerQuestionAgent',
  instructions: getReviewAnswerQuestionPrompt,
  model: getOpenAICompatibleModel,
});
