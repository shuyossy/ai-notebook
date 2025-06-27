// workflowで利用するエージェントをまとめたクラス
import { Agent } from '@mastra/core/agent';
// eslint-disable-next-line import/no-cycle
import {
  SOURCE_ANALYSIS_SYSTEM_PROMPT,
  EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT,
  getChecklistExtractionPrompt,
  getChecklistCategolizePrompt,
  getDocumentReviewExecutionPrompt,
} from './prompts';
import { getOpenAICompatibleModel } from './model/openAICompatible';
import { BaseRuntimeContext } from './types';

export type ChecklistExtractionAgentRuntimeContext = BaseRuntimeContext & {
  extractedItems: string[];
};

export type ClassifyCategoryAgentRuntimeContext = BaseRuntimeContext & {
  maxChecklistsPerCategory: number;
  maxCategories: number;
};

export type ReviewExecuteAgentRuntimeContext = BaseRuntimeContext & {
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
