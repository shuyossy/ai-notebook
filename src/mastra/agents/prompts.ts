import { eq, and, max } from 'drizzle-orm';
import { getStore } from '../../main/store';
import { sources, topics } from '../../db/schema';
import getDb from '../../db';
import { AgentToolStatus } from '../../main/types';
import { RedmineBaseInfo } from '../tools/redmine';

/**
 * データベースからソース情報を取得する
 */
const getSourcesInfoByMDList = async () => {
  const db = await getDb();
  // 有効なソースのみ取得
  const sourceList = await db
    .select()
    .from(sources)
    .where(and(eq(sources.isEnabled, 1), eq(sources.status, 'completed')))
    .orderBy(sources.title);

  // 各ソースのトピックを取得
  const sourceWithTopicList = await Promise.all(
    sourceList.map(async (source) => {
      const topicsList = await db
        .select()
        .from(topics)
        .where(eq(topics.sourceId, source.id))
        .orderBy(topics.name);

      return {
        id: source.id,
        title: source.title,
        path: source.path,
        summary: source.summary,
        topics: topicsList.map((topic) => ({
          name: topic.name,
          summary: topic.summary,
        })),
      };
    }),
  );

  return sourceWithTopicList
    .map(
      (sourceWithTopic) => `  - ID:${sourceWithTopic.id}
    - Title:${sourceWithTopic.title}
    - Path:${sourceWithTopic.path}
    - Summary:${sourceWithTopic.summary}
    - Topics:
  ${sourceWithTopic.topics.map((topic) => `      - Topic: ${topic.name} Summary: ${topic.summary}`).join('\n')}
`,
    )
    .join('\n');
};

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
export const getOrchestratorSystemPrompt = async (
  config: AgentToolStatus,
  redmineInfo: RedmineBaseInfo | null,
): Promise<string> => {
  const store = getStore();

  const sourceListMD = await getSourcesInfoByMDList();

  const systemPrompt = store.get('systemPrompt.content');

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
  config.document && sourceListMD.trim()
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
  config.document && sourceListMD.trim()
    ? `
- **Document Query Tool**
  documentQueryTool: Processes each document query separately using registered content.
  `
    : ''
}
- **Memory Management Tool**
  updateWorkingMemory: Save or update facts in your working memory.

${
  config.redmine
    ? `- **Redmine Integration Tools**
  getRedmineIssuesList: Fetch a filtered list of issues.
  getRedmineIssueDetail: Get details of a specific issue.
  createRedmineIssue: Create a new issue.
  updateRedmineIssue: Update an existing issue.
  _Note:_
    - Redmine URL: ${store.get('redmine').endpoint}
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
  config.gitlab
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
    - GitLab URL: ${store.get('gitlab').endpoint}
    - Specify projects by ID or by non-encoded path (e.g. \`groupA/groupB/project\`).
  `
    : ''
}

${
  config.mcp
    ? `- **MCP (Model Context Protocol) Tools**
  Access additional server-provided tools and APIs via registered MCP servers.`
    : ''
}

---

### Usage Notes
- You may invoke any tool at any time and reuse them as needed.${
    config.document && sourceListMD.trim()
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
export const getSourceQuerySystemPrompt = (content: string) => `
You are an expert on the following document.
Answer questions accurately based on the document's content.
If information is not found in the document, respond with "This information is not present in the document."

Document:
${content}
`;

/**
 * チェックリスト抽出用のシステムプロンプトを取得する関数
 * @param extractedItems  これまでに抽出済みのチェックリスト項目（文字列配列）
 */
export function getChecklistExtractionPrompt(extractedItems: string[]): string {
  return `
You are a specialist in extracting checklist items from documents.
Additionally, if you determine the document is not a checklist document, explicitly set isChecklistDocument to false.

${
  extractedItems.length > 0
    ? `So far, you have identified ${extractedItems.length} items:
${extractedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
    : `Given a document, first decide whether it is a checklist document.`
}

${extractedItems.length > 0 ? 'From' : 'Then, from'} the full document text, please find ${extractedItems.length > 0 ? '**additional checklist items that have not yet been captured**' : '**every checklist item**'} exactly as written, **without changing or paraphrasing**.
Ensure you never omit or alter any checklist text.
**Important:** Only output the checklist items (and the isChecklistDocument flag). Do not extract or include any other parts of the document that are not actual checklist entries.
`;
}

/**
 * チェックリストカテゴリ分割用のシステムプロンプトを取得する関数
 * @param maxItems  一つのカテゴリに含める最大チェックリスト数
 * @param maxCategories  最大カテゴリ数（デフォルトは10）
 */
export function getChecklistCategolizePrompt(
  maxItems: number,
  maxCategories: number = 10,
): string {
  return `
You are a categorization assistant.
When given a list of checklists (each with an ID and content), partition them into up to ${maxCategories} meaningful categories.

Constraints:
1. Every single checklist item must be assigned to exactly one category. No items should be left unclassified.
2. You may create at most 10 categories.
3. Each category may contain no more than ${maxItems} checklist items.
4. Distribute items as evenly as possible across categories to achieve a balanced allocation, while preserving thematic coherence.
`;
}

/**
 * Generates the system prompt for the document review execution agent.
 * @param checklists - Array of checklist items with id and content
 * @returns A string to use as system instructions for the review agent
 */
export function getDocumentReviewExecutionPrompt(
  checklists: Array<{ id: number; content: string }>,
): string {
  // Build a human-readable list of checklist items
  const formattedList = checklists
    .map((item) => `ID: ${item.id} - ${item.content}`)
    .join('\n');
  return `You are a professional document reviewer. Your job is to evaluate the user-provided document against a set of checklist items.

Checklist items:
${formattedList}

Instructions:
1. For each checklist item, assign one of these ratings:
   - A: Excellent — fully meets the criterion.
   - B: Satisfactory — partially meets the criterion.
   - C: Needs Improvement — does not meet the criterion.
   - –: Not Applicable / Cannot Evaluate — outside the scope or cannot be assessed.
2. For each item, write a comment in Japanese following this exact structure:

   【評価理由・根拠】
   Provide the reasoning and evidence here (cite specific sections or examples in the document).

   【改善提案】
   Provide actionable suggestions here (how to better satisfy the criterion).

3. In your comments, be sure to:
   a) Cite specific parts of the document as evidence.
   b) Separate discussions by section if some parts meet the item and others do not.
   c) Cover every relevant occurrence—do not offer only a general summary.
4. Do not omit any checklist item; review the entire document against each criterion before finalizing your evaluation.

Please ensure clarity, conciseness, and a professional tone.`;
}
