import { eq, and } from 'drizzle-orm';
import { getStore } from '../../main/store';
import { sources, topics } from '../../db/schema';
import getDb from '../../db';
import { AgentToolStatus } from '../../main/types';

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
You are a document analysis expert. Analyze the given document and generate an appropriate title and summary.
The title should be concise and accurately represent the content.
The summary should include all key points from the document without omission.
`;

/**
 * トピック抽出用のシステムプロンプト
 */
export const TOPIC_EXTRACTION_SYSTEM_PROMPT = `
You are a document analysis expert. Analyze the given document and extract all important topics.
Extract topics comprehensively from the document content.

You must extract at least 5 topics.
`;

/**
 * トピック要約用のシステムプロンプト
 */
export const TOPIC_SUMMARY_SYSTEM_PROMPT = `
You are a document analysis expert. Extract information about specific topics from the given document and generate summaries for each topic.
Include all important information related to each topic in the summaries.
`;

/**
 * トピックと要約を抽出するためのシステムプロンプト
 */
export const EXTRACT_TOPIC_AND_SUMMARY_SYSTEM_PROMPT = `
You are a document analysis expert.
First, analyze the given document and extract **all** topics contained within.
Extract topics comprehensively from the document content.
You must extract at least 5 topics.
Then, generate summaries for each extracted topic.
Each summary must include **all** important information related to the topic.
`;

/**
 * オーケストレーションAIエージェントのシステムプロンプトを生成する
 * @param config ツールの有効/無効を指定する設定オブジェクト
 * @returns システムプロンプト文字列
 */
export const getOrchestratorSystemPrompt = async (
  config: AgentToolStatus,
): Promise<string> => {
  const store = getStore();

  const sourceListMD = await getSourcesInfoByMDList();

  const prompt = `
You are a highly capable tool-utilizing AI agent.
When given questions or tasks from users, execute the optimal response using the available tools following these steps:
1. Plan the work process to address the user's question or request
2. Execute each step of the process utilizing appropriate tools
3. After completion, review all actions to ensure nothing was missed in addressing the user's question or request. If gaps are found, return to step 1
4. Upon completion, report the results clearly to the user

Users can register reference sources. When a question or task has relevant information in these sources, utilize that source content to address the request.

When handling questions and requests, note the following points:
- Keep WorkingMemory content up-to-date at all times
- If there is any uncertainty, ask the user for clarification rather than making assumptions
- First consider if registered source information can be used to answer questions
- If source content does not align with the user's intent, do not force its use
- When relevant sources are used, explicitly mention the reference

Available tools:
- Source Query Tools
  - sourceQueryTool: An expert AI agent answers questions based on registered source content. you can ask multiple queries at once, so break down complex questions into multiple topics.
- Memory Tools
  - updateWorkingMemory: Updates the WorkingMemory.
${
  config.stagehand
    ? `- Web Operation Tools (Using Stagehand, other AI agents execute browser operations)
  - stagehandActTool: Executes specified operations on web pages (e.g., button clicks, form inputs)
  - stagehandObserveTool: Detects and identifies elements on web pages
  - stagehandExtractTool: Extracts data from web pages
  - stagehandNavigateTool: Navigates to explicitly specified URLs`
    : ''
}
${
  config.redmine
    ? `- Redmine Operation Tools
  - getRedmineInfo: Retrieves basic information from Redmine instance (trackers, statuses, priorities, etc.). Execute this tool before using other Redmine tools to get accurate information needed as input.
  - getRedmineIssuesList: Gets list of project tickets. Can filter by status, tracker, assignee, and version.
  - getRedmineIssueDetail: Retrieves details of a specific ticket.
  - createRedmineIssue: Creates a new ticket in Redmine.
  - updateRedmineIssue: Updates an existing Redmine ticket.`
    : ''
}
${
  config.gitlab
    ? `- GitLab Operation Tools
  - getGitLabFileContent: Retrieves file information (name, size, content etc.) from GitLab project (repository). File content is Base64 encoded.
  - getGitLabRawFile: Gets raw file from GitLab project (repository) without encoding.
  - getGitLabBlameFile: Gets blame file from GitLab project (repository).
  - getGitLabRepositoryTree: Gets tree structure of GitLab project (repository).
  - getMergeRequestDetail: Gets merge request details from specified GitLab project (repository).
  - addMergeRequestComment: Adds comment to merge request in specified GitLab project (repository).
  - addMergeRequestDiffComment: Adds comment to merge request diff in specified GitLab project (repository).`
    : ''
}
${
  config.mcp
    ? `- MCP (Model Context Protocol) Server Tools
  - Access various tools and resources provided by registered MCP servers.
  - Access server-specific tools and resources, enabling external API integrations and extended functionality.`
    : ''
}

Tool Usage Notes:
- General
  - Tools can be used any number of times at any timing
${
  config.redmine
    ? `- Redmine Tool Usage
  - Redmine URL: ${store.get('redmine').endpoint}`
    : ''
}
${
  config.gitlab
    ? `- GitLab Tool Usage
  - GitLab URL: ${store.get('gitlab').endpoint}
  - When specifying a project (repository), you need either a project ID or URL-encoded path
    - For example, if the project URL is ${store.get('gitlab').endpoint}/groupA/groupB/project, the URL-encoded path would be groupA%2FgroupB%2Fproject (/ is encoded as %2F)`
    : ''
}
- Source Query Tool Usage
  - Use sourceQueryTool multiple times on the same source if needed to gather comprehensive information
  - Use sourceQueryTool across multiple sources when necessary to collect sufficient information
  - Below is a list of registered sources with their summaries and topics
  Note: This is a summary only. Use sourceQueryTool to get detailed source information.
${sourceListMD}
`;
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
