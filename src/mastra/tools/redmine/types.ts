/**
 * Redmine操作ツールで使用する型定義
 */

/**
 * Redmineカスタムフィールド
 */
export interface RedmineCustomField {
  id: number;
  name: string;
  value: string | number | boolean | null;
}

/**
 * Redmineチケット（Issue）
 */
export interface RedmineIssue {
  id: number;
  project: {
    id: number;
    name: string;
  };
  tracker: {
    id: number;
    name: string;
  };
  status: {
    id: number;
    name: string;
  };
  priority: {
    id: number;
    name: string;
  };
  author: {
    id: number;
    name: string;
  };
  assigned_to?: {
    id: number;
    name: string;
  };
  subject: string;
  description: string;
  start_date?: string;
  due_date?: string;
  done_ratio: number;
  created_on: string;
  updated_on: string;
  closed_on?: string;
  custom_fields?: RedmineCustomField[];
  fixed_version?: {
    id: number;
    name: string;
  };
  parent?: {
    id: number;
  };
  estimated_hours?: number;
}

/**
 * Redmineチケット作成/更新用のデータ
 */
export interface RedmineIssueData {
  project_id: number | string;
  subject: string;
  description?: string;
  status_id?: number | string;
  tracker_id?: number | string;
  priority_id?: number | string;
  assigned_to_id?: number;
  parent_issue_id?: number;
  start_date?: string;
  due_date?: string;
  estimated_hours?: number;
  done_ratio?: number;
  fixed_version_id?: number | string;
  custom_fields?: {
    id: number;
    value: string | number | boolean | null;
  }[];
}

/**
 * Redmineチケットフィルター
 */
export interface IssueFilter {
  project_id?: number | string;
  status_id?: number | string | 'open' | 'closed' | '*';
  tracker_id?: number | string;
  assigned_to_id?: number | 'me';
  author_id?: number | string | 'me';
  priority_id?: number | string;
  fixed_version_id?: number | string;
  subject?: string;
  created_on?: string;
  updated_on?: string;
  sort?: string;
}

/**
 * Redmineタイムエントリー
 */
export interface RedmineTimeEntry {
  id: number;
  project: {
    id: number;
    name: string;
  };
  issue?: {
    id: number;
  };
  user: {
    id: number;
    name: string;
  };
  activity: {
    id: number;
    name: string;
  };
  hours: number;
  comments: string;
  spent_on: string;
  created_on: string;
  updated_on: string;
}

/**
 * Redmineタイムエントリー作成/更新用のデータ
 */
export interface RedmineTimeEntryData {
  issue_id?: number;
  project_id?: number | string;
  spent_on: string;
  hours: number;
  activity_id?: number | string;
  comments?: string;
  user_id?: number;
}

/**
 * Redmineタイムエントリーフィルター
 */
export interface TimeEntryFilter {
  project_id?: number | string;
  issue_id?: number;
  user_id?: number | 'me';
  activity_id?: number | string;
  spent_on?: string;
}

/**
 * RedmineWikiページ
 */
export interface RedmineWikiPage {
  title: string;
  parent?: {
    title: string;
  };
  text: string;
  version: number;
  author: {
    id: number;
    name: string;
  };
  comments?: string;
  created_on: string;
  updated_on: string;
}

/**
 * RedmineWikiページ作成/更新用のデータ
 */
export interface RedmineWikiPageData {
  title: string;
  parent_title?: string;
  text: string;
  comments?: string;
  version?: number;
}
