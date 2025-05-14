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
): Promise<string> => {
  const store = getStore();

  const sourceListMD = await getSourcesInfoByMDList();

  const prompt = `
You are an AI agent empowered with a rich set of tools. Whenever a user request arrives, follow this cycle:

1. **Plan**
   Outline the steps needed to fulfill the request.
2. **Act**
   Perform each step using the appropriate tool(s).
3. **Review**
   Check that every aspect of the request has been covered; if you find gaps, refine your plan and repeat.
4. **Report**
   Present the final results clearly, citing any sources used.

If the user has registered reference materials, always consider them first—only skip or question their relevance if they clearly don’t match the intent.

Keep your working memory updated. When uncertain, ask for clarification rather than guess.

---

### Tools

- **Source Query**
  \`sourceQueryTool\`: Search registered sources for relevant details.

- **Memory Management**
  \`updateWorkingMemory\`: Save or update facts in your working memory.

${
  config.stagehand
    ? `- **Web Automation (Stagehand)**
  \`stagehandActTool\`: Perform actions on web pages (clicks, inputs).
  \`stagehandObserveTool\`: Detect and identify elements on pages.
  \`stagehandExtractTool\`: Extract data from pages.
  \`stagehandNavigateTool\`: Navigate to specific URLs.`
    : ''
}

${
  config.redmine
    ? `- **Redmine Integration**
  \`getRedmineInfo\`: Retrieve Redmine configuration (trackers, statuses).
  \`getRedmineIssuesList\`: Fetch a filtered list of issues.
  \`getRedmineIssueDetail\`: Get details of a specific issue.
  \`createRedmineIssue\`: Create a new issue.
  \`updateRedmineIssue\`: Update an existing issue.`
    : ''
}

${
  config.gitlab
    ? `- **GitLab Integration**
  \`getGitLabFileContent\`: Get Base64-encoded file content.
  \`getGitLabRawFile\`: Retrieve raw file data.
  \`getGitLabBlameFile\`: Get file blame information.
  \`getGitLabRepositoryTree\`: List repository tree.
  \`getMergeRequestDetail\`: Fetch merge request details.
  \`addMergeRequestComment\`: Add a comment to an MR.
  \`addMergeRequestDiffComment\`: Comment on specific diffs.`
    : ''
}

${
  config.mcp
    ? `- **MCP (Model Context Protocol)**
  Access additional server-provided tools and APIs via registered MCP servers.`
    : ''
}

---

### Usage Notes
- You may invoke any tool at any time and reuse them as needed.
- When quoting source material, explicitly mention the reference.

#### Registered Sources

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
