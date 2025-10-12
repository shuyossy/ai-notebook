/**
 * ツール表示に関する設定を管理する定数ファイル
 */

/**
 * ツール名と日本語表示のマッピング
 * @key ツールのID
 * @value 日本語での表示名
 */
export const TOOL_NAME_DISPLAY_MAP: Record<string, string> = {
  queryDocumentTool: '検索',

  // Redmine関連のツール
  getRedmineInfo: 'Redmine情報取得',
  getRedmineIssuesList: 'Redmineチケット一覧取得',
  getRedmineIssueDetail: 'Redmineチケット詳細取得',
  createRedmineIssue: 'Redmineチケット作成',
  updateRedmineIssue: 'Redmineチケット更新',

  // GitLab関連のツール
  getGitLabFileContent: 'GitLabファイル情報取得',
  getGitLabRawFile: 'GitLabファイル取得',
  getGitLabBlameFile: 'GitLabBlameファイル取得',
  getGitLabRepositoryTree: 'GitLabリポジトリツリー取得',
  getMergeRequestDetail: 'マージリクエスト詳細取得',
  addMergeRequestComment: 'マージリクエストコメント追加',
  addMergeRequestDiffComment: 'マージリクエスト差分コメント追加',

  // レビューチャット用
  researchDocumentStart: 'ドキュメント調査中...',
  researchDocumentComplete: 'ドキュメント調査完了',
};
