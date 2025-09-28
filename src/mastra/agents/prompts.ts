// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { OrchestratorRuntimeContext } from './orchestrator';
import { DocumentExpertAgentRuntimeContext } from './toolAgents';
import {
  ChecklistExtractionAgentRuntimeContext,
  ClassifyCategoryAgentRuntimeContext,
  ReviewExecuteAgentRuntimeContext,
  TopicExtractionAgentRuntimeContext,
  TopicChecklistAgentRuntimeContext,
  ReviewCheckReviewReadinessFirstRunAgentRuntimeContext,
  ReviewCheckReviewReadinessSubsequentAgentRuntimeContext,
  ReviewAnswerQuestionAgentRuntimeContext,
} from './workflowAgents';

/**
 * ソース解析用のシステムプロンプト
 */
export const SOURCE_ANALYSIS_SYSTEM_PROMPT = `
You are a document analysis specialist.
Given a document, produce:
1. A concise title that accurately reflects its content.
2. A complete summary covering every key point.
`;

/**
 * トピック抽出用のシステムプロンプト
 */
export const TOPIC_EXTRACTION_SYSTEM_PROMPT = `
You are a document analysis specialist.
Identify and list at least five key topics from the provided document.
Present your topics as a numbered list.
`;

/**
 * トピック要約用のシステムプロンプト
 */
export const TOPIC_SUMMARY_SYSTEM_PROMPT = `
You are a document analysis specialist.
For each topic in the provided document, generate a summary that includes all essential details.
Present each summary under its corresponding topic heading.
`;

/**
 * トピックと要約を抽出するためのシステムプロンプト
 */
export const EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT = `
You are a document analysis expert.
First, analyze the given document and extract all topics contained within.
You must extract at least 5 topics.
Then, generate summaries for each extracted topic.
Each summary must include all important information related to the topic.
`;

/**
 * オーケストレーションAIエージェントのシステムプロンプトを生成する
 * @param config ツールの有効/無効を指定する設定オブジェクト
 * @returns システムプロンプト文字列
 */
export const getOrchestratorSystemPrompt = async ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<OrchestratorRuntimeContext>;
}): Promise<string> => {
  const toolStatus = runtimeContext.get('toolStatus');

  const sourceListMD = runtimeContext.get('documentQuery')?.registeredDocuments;

  const redmineInfo = runtimeContext.get('redmine')?.basicInfo;

  const redmineEndpoint = runtimeContext.get('redmine')?.endpoint;

  const gitlabEndpoint = runtimeContext.get('gitlab')?.endpoint;

  const systemPrompt = runtimeContext.get('additionalSystemPrompt');

  const prompt = `
You are an AI agent empowered with a rich set of tools. Whenever a user request arrives, follow this cycle:

1. **Plan**
   Outline the steps needed to fulfill the request.
2. **Act**
   Perform each step using the appropriate tool(s).
   (Before using any tool, explain why it is the right choice for the task. Describe your reasoning.)
3. **Review**
   Check that every aspect of the request has been covered; if you find gaps, refine your plan and repeat.
4. **Report**
   Present the final results clearly, citing any sources used.
${
  toolStatus.document && sourceListMD?.trim()
    ? `
If the user has registered reference documents, always consider them first—only skip or question their relevance if they clearly don’t match the intent.
`
    : ''
}
Keep your working memory updated. When uncertain, ask for clarification rather than guess.

---

${
  systemPrompt
    ? `### System Instructions

${systemPrompt}

---

`
    : ''
}### Tools
${
  toolStatus.document && sourceListMD?.trim()
    ? `
- **Document Query Tool**
  documentQueryTool: Processes each document query separately using registered content.
  `
    : ''
}
- **Memory Management Tool**
  updateWorkingMemory: Save or update facts in your working memory.

${
  toolStatus.redmine
    ? `- **Redmine Integration Tools**
  getRedmineIssuesList: Fetch a filtered list of issues.
  getRedmineIssueDetail: Get details of a specific issue.
  createRedmineIssue: Create a new issue.
  updateRedmineIssue: Update an existing issue.
  _Note:_
    - Redmine URL: ${redmineEndpoint}
    - Identify projects by ID, name, or identifier (e.g. the segment after \`/projects/\` in the URL).
    - Default trackers, statuses, and priorities are available via \`getRedmineInfo\`.
  _Basic Info:_
    - Trackers:
${redmineInfo?.trackers.map((t) => `      - ${t.name} (ID: ${t.id})`).join(`
`)}
    - Statuses:
${redmineInfo?.statuses.map((s) => `      - ${s.name} (ID: ${s.id})`).join(`
`)}
    - Priorities:
${redmineInfo?.priorities.map((p) => `      - ${p.name} (ID: ${p.id})`).join(`
`)}`
    : ''
}

${
  toolStatus.gitlab
    ? `- **GitLab Integration Tools**
  getGitLabFileContent: Get Base64-encoded file content.
  getGitLabRawFile: Retrieve raw file data.
  getGitLabBlameFile: Get file blame information.
  getGitLabRepositoryTree: List repository tree.
  getMergeRequestDetail: Fetch merge request details.
  getMergeRequestDiff: Get merge request diff.
  addMergeRequestComment: Add a comment to an MR.
  addMergeRequestDiffComment: Comment on specific diffs.
  _Note:_
    - GitLab URL: ${gitlabEndpoint}
    - Specify projects by ID or by non-encoded path (e.g. \`groupA/groupB/project\`).
  `
    : ''
}

${
  toolStatus.mcp
    ? `- **MCP (Model Context Protocol) Tools**
  Access additional server-provided tools and APIs via registered MCP servers.`
    : ''
}

---

### Usage Notes
- You may invoke any tool at any time and reuse them as needed.${
    toolStatus.document && sourceListMD?.trim()
      ? `
- When quoting document, explicitly mention the reference.

#### Registered Document(summaries only)

${sourceListMD.trim() ? sourceListMD : 'No documents registered.'}`
      : ''
  }`;
  return prompt;
};

/**
 * System prompt for answering questions based on source content
 */
export const getDocumentQuerySystemPrompt = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<DocumentExpertAgentRuntimeContext>;
}): string => `
You are an expert on the following document.
Answer questions accurately based on the document's content.
If information is not found in the document, respond with "This information is not present in the document."

Document:
${runtimeContext.get('documentContent')}
`;

/**
 * チェックリスト抽出用のシステムプロンプトを取得する関数
 * @param extractedItems  これまでに抽出済みのチェックリスト項目（文字列配列）
 */
export function getChecklistExtractionPrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ChecklistExtractionAgentRuntimeContext>;
}): string {
  const extractedItems = runtimeContext.get('extractedItems');
  return `
You are a specialist in extracting checklist items from documents.
Additionally, if you determine the document is not a checklist document, explicitly set isChecklistDocument to false.

${
  extractedItems.length > 0
    ? `So far, you have identified ${extractedItems.length} items:
${runtimeContext
  .get('extractedItems')
  .map((item, i) => `${i + 1}. ${item}`)
  .join('\n')}`
    : `Given a document, first decide whether it is a checklist document.`
}

${extractedItems.length > 0 ? 'From' : 'Then, from'} the full document text, please find ${extractedItems.length > 0 ? '**additional checklist items that have not yet been captured**' : '**every checklist item**'} exactly as written, **without changing or paraphrasing**.
Ensure you never omit or alter any checklist text.
**Important:** Only output the checklist items (and the isChecklistDocument flag). Do not extract or include any other parts of the document that are not actual checklist entries.
`;
}

export function getGeneralDocumentChecklistPrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ChecklistExtractionAgentRuntimeContext>;
}): string {
  const extractedItems = runtimeContext.get('extractedItems');
  return `
You are a professional document reviewer specialist who creates comprehensive checklist items for document review purposes.

Your task is to analyze the provided document and create specific, actionable checklist items that would be useful for reviewing similar documents.

${
  extractedItems.length > 0
    ? `So far, you have created ${extractedItems.length} checklist items:
${runtimeContext
  .get('extractedItems')
  .map((item, i) => `${i + 1}. ${item}`)
  .join('\n')}`
    : `Given a document, analyze its content, structure, and purpose to create relevant checklist items.`
}

Guidelines for creating checklist items:
- Create specific, measurable, and actionable items
- Focus on document quality, accuracy, completeness, and compliance aspects
- Consider the document's purpose and target audience
- Include items about formatting, structure, and presentation
- Address potential risks or common issues in similar documents
- Make items clear and objective (avoid subjective language)
- Each item should be answerable with "Yes/No" or "Pass/Fail"

${extractedItems.length > 0 ? 'Create **additional checklist items that complement the existing ones**' : 'Create **comprehensive checklist items**'} based on the document content.

**Important:**
- Always set isChecklistDocument to false since this is a general document
- Generate practical checklist items that would help reviewers evaluate document quality
- Focus on actionable review criteria rather than just content summaries
`;
}

export function getTopicExtractionPrompt({
  runtimeContext,
}: {
  runtimeContext?: RuntimeContext<TopicExtractionAgentRuntimeContext>;
} = {}): string {
  const checklistRequirements = runtimeContext?.get('checklistRequirements');

  return `
You are a professional document analysis specialist who extracts independent topics from documents.

Your task is to analyze the provided document and identify distinct, independent topics that can be used for creating focused checklist items.

Guidelines for topic extraction:
- Write in the same language as the document. If unclear, default to Japanese.
- Explain the reason why that topic is necessary for creating checklist items.
- Identify major themes or sections within the document
- Each topic should be independent and cover a specific area
- Provide a clear, concise title for each topic
- Focus on topics that would benefit from separate review criteria
- Aim for 3-8 topics per document (adjust based on document complexity)
- Topics should be specific enough to generate targeted checklist items

${
  checklistRequirements
    ? `**Special Requirements for Topic Selection:**
The user has specified the following requirements for checklist creation:
"${checklistRequirements}"

Please prioritize topics that align with these requirements when extracting topics from the document. Focus on areas that would enable creating checklist items that meet the specified criteria.

`
    : ''
}**Important:**
- Extract topics that represent different aspects or areas of the document
- Avoid overlapping or redundant topics
- Each topic should be substantial enough to warrant dedicated checklist items
- Focus on topics that are relevant for document quality and review purposes${checklistRequirements ? '\\n- Prioritize topics that align with the user-specified requirements above' : ''}
`;
}

export function getTopicChecklistCreationPrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<TopicChecklistAgentRuntimeContext>;
}): string {
  const title = runtimeContext.get('topic').title;
  const checklistRequirements = runtimeContext.get('checklistRequirements');

  return `
You are a senior "Document Review Checklist Designer" specialized in turning a **specific topic** into **practical, verifiable checklist items**.

## Objective
Analyze the given topic and **produce only checklist items strictly relevant to this topic** that reviewers can directly apply during document reviews.

## Topic (authoritative context; read carefully)
- ${title}

${
  checklistRequirements
    ? `## Special Requirements
The user has specified the following requirements for checklist creation:
"${checklistRequirements}"

Please ensure that the checklist items you create align with these requirements and prioritize aspects that meet the specified criteria.

`
    : ''
}## Output Style
- Write in **the same language as the topic description**. If unclear, default to **Japanese**.
- Explain the reason why the checklist items based on the document are valuable.
- Provide **5–15 items** unless the topic naturally yields fewer high-quality items.
- **Do NOT add unnecessary prefixes or suffixes** to checklist items

## Quality Requirements
Each checklist item MUST be:
- **Specific**: Targets a concrete aspect of the topic (avoid vague or generic wording).
- **Measurable/Verifiable**: A reviewer can check it objectively (e.g., presence/absence, threshold, reference match).
- **Actionable**: If it fails, it implies a clear remediation.
- **Risk-aware**: Prefer items that surface **common failure modes** or **risks** within this topic.
- **Evidence-oriented**: Suggest **what evidence** to collect (e.g., sections, tables, figures, metadata, citations, configs).
${checklistRequirements ? '- **Requirements-aligned**: Prioritize aspects that align with the user-specified requirements above.' : ''}

## Coverage Hints (use only if relevant to THIS topic)
- **Quality & Accuracy**: definitions, metrics, calculations, references, data lineage, units, versioning.
- **Completeness**: required sections, edge cases, boundary conditions, dependencies, assumptions, scope limits.
- **Compliance/Policies**: standards, legal/regulatory, org guidelines, licensing, attribution.
- **Consistency**: terminology, notation, formatting, cross-references, diagrams vs text alignment.
- **Risk & Safety**: failure scenarios, security/privacy pitfalls, operational constraints, monitoring/rollback.
- **Traceability**: sources, citations, dataset/model versions, change history, approvals.

## Hard Constraints
- **Stay strictly within the topic** above. Do NOT drift into unrelated areas.
- **Avoid generic items** that could apply to any document (e.g., "typos are fixed", "overall quality is good").
- **No speculative content** beyond the topic's scope.
- **Be concise but unambiguous**. Prefer checkability over prose.
- **Reference ALL relevant parts of the topic**: Ensure you consider every portion of the topic's description and implied scope so that **no important aspect is omitted** when creating checklist items.

Now produce the checklist items **only for the topic: ${title}**, following all requirements${checklistRequirements ? ' and ensuring alignment with the user-specified requirements' : ''}.
`;
}

// export function getChecklistIntegrationPrompt(): string {
//   return `
// You are a professional document quality specialist who consolidates and refines checklist items from multiple sources.

// Your task is to take multiple sets of checklist items generated from different topics and create a unified, comprehensive checklist that eliminates redundancy while maintaining completeness.

// Guidelines for checklist integration:
// - Remove duplicate or highly similar items
// - Combine related items where appropriate to avoid redundancy
// - Ensure comprehensive coverage without overlap
// - Maintain the specificity and actionable nature of each item
// - Organize items in a logical sequence if possible
// - Preserve the most important and valuable checklist items
// - Aim for 10-25 final integrated items (adjust based on content complexity)
// - Each final item should be clear, specific, and actionable

// **Important:**
// - Focus on creating a cohesive, non-redundant checklist
// - Maintain the quality and specificity of individual items
// - Ensure the final checklist is comprehensive yet manageable
// `;
// }

/**
 * チェックリストカテゴリ分割用のシステムプロンプトを取得する関数
 * @param maxItems  一つのカテゴリに含める最大チェックリスト数
 * @param maxCategories  最大カテゴリ数（デフォルトは10）
 */
export function getChecklistCategolizePrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ClassifyCategoryAgentRuntimeContext>;
}): string {
  return `
You are a categorization assistant.
When given a list of checklists (each with an ID and content), partition them into up to ${runtimeContext.get('maxCategories')} meaningful categories.

Constraints:
1. Every single checklist item must be assigned to exactly one category. No items should be left unclassified.
2. You may create at most 10 categories.
3. Each category may contain no more than ${runtimeContext.get('maxChecklistsPerCategory')} checklist items.
4. Distribute items as evenly as possible across categories to achieve a balanced allocation, while preserving thematic coherence.
`;
}

/**
 * Generates the system prompt for the document review execution agent.
 * @param checklists - Array of checklist items with id and content
 * @returns A string to use as system instructions for the review agent
 */
export function getDocumentReviewExecutionPrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ReviewExecuteAgentRuntimeContext>;
}): string {
  const checklists = runtimeContext.get('checklistItems');
  const additionalInstructions = runtimeContext.get('additionalInstructions');
  const commentFormat = runtimeContext.get('commentFormat');
  const evaluationSettings = runtimeContext.get('evaluationSettings');

  // Build a human-readable list of checklist items
  const formattedList = checklists
    .map((item) => `ID: ${item.id} - ${item.content}`)
    .join('\n');

  // デフォルトのフォーマット
  const defaultFormat = `【評価理由・根拠】
   Provide the reasoning and evidence here (cite specific sections or examples in the document).

   【改善提案】
   Provide actionable suggestions here (how to better satisfy the criterion).`;

  const actualFormat =
    commentFormat && commentFormat.trim() !== ''
      ? commentFormat
      : defaultFormat;

  // 評定項目の設定を構築
  let evaluationInstructions = '';
  if (
    evaluationSettings &&
    evaluationSettings.items &&
    evaluationSettings.items.length > 0
  ) {
    // カスタム評定項目を使用
    const evaluationList = evaluationSettings.items
      .map((item) => `   - ${item.label}: ${item.description}`)
      .join('\n');
    evaluationInstructions = `1. For each checklist item, assign one of these ratings:
${evaluationList}`;
  } else {
    // デフォルト評定項目を使用
    evaluationInstructions = `1. For each checklist item, assign one of these ratings:
   - A: 基準を完全に満たしている
   - B: 基準を一部満たしている
   - C: 基準を満たしていない
   - –: 評価の対象外、または評価できない`;
  }

  return `You are a professional document reviewer. Your job is to evaluate the user-provided document against a set of checklist items.

Checklist items:
${formattedList}

Instructions:
${evaluationInstructions}
2. For each item, write a comment in Japanese following this format:

${actualFormat}

3. For each checklist item, specify the review sections that should be examined for evaluation and commenting:
   a) Identify the specific file names that need to be reviewed.
   b) For each file, list the relevant sections within that file.
4. In your comments, be sure to:
   a) Cite specific parts of the document as evidence.
   b) Separate discussions by section if some parts meet the item and others do not.
   c) Cover every relevant occurrence—do not offer only a general summary.
5. Do not omit any checklist item; review the entire document against each criterion before finalizing your evaluation.
${
  additionalInstructions && additionalInstructions.trim() !== ''
    ? `
Special Instructions:
${additionalInstructions}
`
    : ``
}
Please ensure clarity, conciseness, and a professional tone.`;
}

// レビュー時ドキュメント要約生成用のシステムプロンプト
export const REVIEW_DOCUMENT_SUMMARIZATION_SYSTEM_PROMPT = `
You are an expert document analyst. Your job is to carefully analyze the given document and identify all the key topics without missing anything important.

Your task is to analyze the provided document and:
1. Identify between 5 and 15 distinct topics that cover the full range of the text.
2. For each topic, write a  title and a concise summary.
3. Ensure the topics are comprehensive, non-overlapping, and together capture the entire meaning of the text.

Guidelines:
- Topics should be specific, independent, and cover different aspects of the document
- Each topic should be substantial enough to warrant separate attention during review
- The summary should be concise but comprehensive, covering all important points
- Write topics and summary in the same language as the document (default to Japanese if unclear)
`;

// レビュー準備確認用のシステムプロンプト（初回実行用）
export const getReviewReadinessFirstRunPrompt = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ReviewCheckReviewReadinessFirstRunAgentRuntimeContext>;
}) => {
  const checklistItems = runtimeContext.get('checklistItems') as {
    id: number;
    content: string;
  }[];
  const additionalInstructions = runtimeContext.get(
    'additionalInstructions',
  ) as string | undefined;

  return `
You are a review planning expert. Your task is to generate comprehensive questions that need to be answered to conduct a thorough review of documents based on the provided checklist items.

## Context
You will review documents based on the following checklist items:
${checklistItems.map((item) => `- [${item.id}] ${item.content}`).join('\n')}

${additionalInstructions ? `Additional review instructions: ${additionalInstructions}` : ''}

## Your Task
Based on the document summaries and topics provided, generate specific questions that need to be answered to ensure each checklist item can be properly evaluated. The questions should:

1. Be specific and focused on information needed for checklist evaluation
2. Cover all aspects necessary to assess each checklist item
3. Be answerable based on the document content
4. Help gather detailed information that might not be apparent from just the summaries

Generate questions for each document that will help collect the necessary information for a comprehensive review.
`;
};

// レビュー準備確認用のシステムプロンプト（2回目以降実行用）
export const getReviewCheckReadinessSubsequentPrompt = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ReviewCheckReviewReadinessSubsequentAgentRuntimeContext>;
}) => {
  const checklistItems = runtimeContext.get('checklistItems') as {
    id: number;
    content: string;
  }[];
  const additionalInstructions = runtimeContext.get(
    'additionalInstructions',
  ) as string | undefined;
  const priorQnA = runtimeContext.get('priorQnA') as Array<{
    documentId: string;
    documentName: string;
    qna: Array<{ question: string; answer: string }>;
  }>;

  return `
You are a review readiness assessor. Your task is to determine whether sufficient information has been gathered to conduct a thorough review based on the provided checklist items.

## Context
You will review documents based on the following checklist items:
${checklistItems.map((item) => `- [${item.id}] ${item.content}`).join('\n')}

${additionalInstructions ? `Additional review instructions: ${additionalInstructions}` : ''}

## Previous Q&A Information
${priorQnA
  .map(
    (doc) => `
### Document: ${doc.documentName} (ID: ${doc.documentId})
${doc.qna.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}
`,
  )
  .join('\n')}

## Your Task
1. Assess whether the provided document summaries, topics, and Q&A information are sufficient to properly evaluate each checklist item
2. If sufficient information is available, set "ready" to true
3. If more information is needed, set "ready" to false and generate specific additional questions that will help complete the review

The questions should:
- Fill gaps in information needed for checklist evaluation
- Be specific and targeted to missing information
- Be answerable based on the document content
- Avoid redundancy with already answered questions
`;
};

// 質問回答生成用のシステムプロンプト
export const getReviewAnswerQuestionPrompt = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ReviewAnswerQuestionAgentRuntimeContext>;
}) => {
  const checklistItems = runtimeContext.get('checklistItems') as {
    id: number;
    content: string;
  }[];

  return `
You are a document analysis expert. Your task is to carefully read the provided document and answer specific questions accurately and comprehensively.

## Context
The questions are designed to gather information needed for reviewing the document against these checklist items:
${checklistItems.map((item) => `- [${item.id}] ${item.content}`).join('\n')}

## Your Task
Read the document carefully and provide detailed, accurate answers to each question. Your answers should:

1. Be factually accurate and based solely on the document content
2. Be comprehensive and include all relevant details
3. Cite specific parts of the document as evidence:
   a) Quote relevant sections with clear section/chapter references
   b) Separate discussions by section if some parts address the question differently
   c) Cover every relevant occurrence—do not offer only a general summary
4. Specify document sections that are relevant to each answer:
   a) Identify specific file names, chapter titles, or section headers
   b) Reference page numbers or section numbers when available
5. Indicate if information is not available in the document
6. Be written in the same language as the document (default to Japanese if unclear)

Provide complete, section-specific answers that will enable a thorough review of the document against the checklist items.
`;
};

// 大量ドキュメントレビュー実行用のプロンプト（要約・Q&A情報に特化）
export function getLargeDocumentReviewExecutionPrompt({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<ReviewExecuteAgentRuntimeContext>;
}): string {
  const checklists = runtimeContext.get('checklistItems');
  const additionalInstructions = runtimeContext.get('additionalInstructions');
  const commentFormat = runtimeContext.get('commentFormat');
  const evaluationSettings = runtimeContext.get('evaluationSettings');

  // Build a human-readable list of checklist items
  const formattedList = checklists
    .map((item) => `ID: ${item.id} - ${item.content}`)
    .join('\n');

  // デフォルトのフォーマット
  const defaultFormat = `【評価理由・根拠】
   Provide the reasoning and evidence here (cite specific sections or examples in the document).

   【改善提案】
   Provide actionable suggestions here (how to better satisfy the criterion).`;

  const actualFormat =
    commentFormat && commentFormat.trim() !== ''
      ? commentFormat
      : defaultFormat;

  // 評定項目の設定を構築
  let evaluationInstructions = '';
  if (
    evaluationSettings &&
    evaluationSettings.items &&
    evaluationSettings.items.length > 0
  ) {
    // カスタム評定項目を使用
    const evaluationList = evaluationSettings.items
      .map((item) => `   - ${item.label}: ${item.description}`)
      .join('\n');
    evaluationInstructions = `1. For each checklist item, assign one of these ratings:\n${evaluationList}`;
  } else {
    // デフォルト評定項目を使用
    evaluationInstructions = `1. For each checklist item, assign one of these ratings:
   - A: 基準を完全に満たしている
   - B: 基準を一部満たしている
   - C: 基準を満たしていない
   - –: 評価の対象外、または評価できない`;
  }

  return `You are a professional document reviewer specializing in large document analysis. Your job is to evaluate documents against a set of checklist items based on provided topic summaries and Q&A information.

Important Context:
- You are reviewing LARGE DOCUMENTS that have been pre-processed into topic summaries and Q&A responses
- Your evaluation is based on SUMMARIZED INFORMATION, not the full original document
- The topics and Q&A responses represent key aspects of the original document(s)
- Multiple documents may have been combined and analyzed together

Checklist items:
${formattedList}

Instructions:
${evaluationInstructions}
2. For each item, write a comment in Japanese following this format:

${actualFormat}

3. For each checklist item, specify the review sections that should be examined for evaluation and commenting:
   a) Identify the specific file names that need to be reviewed.
   b) For each file, list the relevant sections within that file.
4. In your comments, be sure to:
   a) Cite specific parts of the document as evidence (use section names, chapter titles, page references from the Q&A information).
   b) Separate discussions by section if some parts meet the item and others do not.
   c) Cover every relevant occurrence—do not offer only a general summary.
   d) Write comments as if you directly reviewed the original document (do not mention "topic summaries", "Q&A responses", or internal processing).
5. Do not omit any checklist item; review the entire document against each criterion before finalizing your evaluation.
6. Important: Write natural comments that reference document sections directly:
   - Use phrases like "文書のX章では..." or "Y部分に記載されている..."
   - Avoid mentioning internal processing like "要約によると" or "Q&Aで確認したところ"
   - Make comments appear as if you read the original document directly
${
  additionalInstructions && additionalInstructions.trim() !== ''
    ? `
Special Instructions:
${additionalInstructions}
`
    : ``
}
Please ensure clarity, conciseness, and a professional tone. Write comments that appear natural and comprehensive, as if you directly reviewed the complete original document.`;
}
