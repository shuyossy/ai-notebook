/**
 * GitLab操作ツールで使用する型定義
 */

/**
 * GitLabプロジェクト情報
 */
export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  default_branch: string;
  visibility: string;
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  web_url: string;
  readme_url?: string;
  created_at: string;
  last_activity_at: string;
}

/**
 * GitLabブランチ情報
 */
export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  can_push: boolean;
  web_url: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    created_at: string;
    committed_date: string;
  };
}

/**
 * GitLabタグ情報
 */
export interface GitLabTag {
  name: string;
  message: string;
  target: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    created_at: string;
    committed_date: string;
  };
  release?: {
    tag_name: string;
    description: string;
  };
}

/**
 * GitLabリポジトリファイル情報
 */
export interface GitLabFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

/**
 * GitLabリポジトリツリー要素
 */
export interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

/**
 * GitLabコミット情報
 */
export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  created_at: string;
  message: string;
  parent_ids: string[];
  web_url: string;
}

/**
 * GitLabのDiff情報
 */
export interface GitLabDiff {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

/**
 * GitLabイシュー情報
 */
export interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: {
    id: number;
    name: string;
    username: string;
  } | null;
  labels: string[];
  milestone: {
    id: number;
    title: string;
    description: string;
    due_date: string;
    state: string;
    created_at: string;
    updated_at: string;
  } | null;
  assignees: Array<{
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  }>;
  author: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  assignee: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  } | null;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  due_date: string | null;
  confidential: boolean;
  web_url: string;
}

/**
 * GitLabイシュー作成/更新用のデータ
 */
export interface GitLabIssueData {
  title: string;
  description?: string;
  confidential?: boolean;
  assignee_ids?: number[];
  milestone_id?: number;
  labels?: string;
  created_at?: string;
  due_date?: string;
  weight?: number;
}

/**
 * GitLabマージリクエスト情報
 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  merged_by?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  merge_user?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  merged_at?: string;
  closed_by?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  closed_at?: string;
  created_at: string;
  updated_at: string;
  target_branch: string;
  source_branch: string;
  upvotes: number;
  downvotes: number;
  author: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  assignees: Array<{
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  }>;
  assignee?: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  reviewers: Array<{
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  }>;
  source_project_id: number;
  target_project_id: number;
  labels: string[];
  draft: boolean;
  work_in_progress: boolean;
  milestone?: {
    id: number;
    title: string;
    description: string;
    due_date: string;
    state: string;
    created_at: string;
    updated_at: string;
  };
  merge_when_pipeline_succeeds: boolean;
  merge_status: string;
  detailed_merge_status: string;
  sha: string;
  merge_commit_sha?: string;
  squash_commit_sha?: string;
  user_notes_count: number;
  web_url: string;
}

/**
 * GitLabマージリクエスト作成用のデータ
 */
export interface GitLabMergeRequestData {
  source_branch: string;
  target_branch: string;
  title: string;
  description?: string;
  assignee_ids?: number[];
  reviewer_ids?: number[];
  labels?: string;
  milestone_id?: number;
  remove_source_branch?: boolean;
  squash?: boolean;
}

/**
 * GitLabマージリクエストコメント
 */
export interface GitLabMergeRequestComment {
  id: number;
  body: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * GitLabパイプライン情報
 */
export interface GitLabPipeline {
  id: number;
  iid: number;
  project_id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  user: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
}

/**
 * GitLabジョブ情報
 */
export interface GitLabJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
  queued_duration?: number;
  pipeline: {
    id: number;
    project_id: number;
    ref: string;
    sha: string;
    status: string;
  };
  ref: string;
  web_url: string;
  runner?: {
    id: number;
    description: string;
    ip_address: string;
    active: boolean;
    is_shared: boolean;
  };
  artifacts_file?: {
    filename: string;
    size: number;
  };
}

/**
 * GitLab変数情報
 */
export interface GitLabVariable {
  key: string;
  variable_type: 'env_var' | 'file';
  value: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
}

/**
 * GitLab変数作成/更新用のデータ
 */
export interface GitLabVariableData {
  key: string;
  value: string;
  variable_type?: 'env_var' | 'file';
  protected?: boolean;
  masked?: boolean;
  environment_scope?: string;
}
