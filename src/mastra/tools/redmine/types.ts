import { BaseToolResponse } from '../types';

// チケット一覧のレスポンス型
export type IssuesListResponse = BaseToolResponse<{
  issues: any[]; // Redmineのチケット型は必要に応じて定義
}>;

// チケット詳細のレスポンス型
export type IssueDetailResponse = BaseToolResponse<{
  issue: any; // Redmineのチケット型は必要に応じて定義
}>;

// チケット作成のレスポンス型
export type CreateIssueResponse = BaseToolResponse<{
  created_issue: any; // Redmineのチケット型は必要に応じて定義
}>;

// チケット更新のレスポンス型
export type UpdateIssueResponse = BaseToolResponse<{
  updated_issue: any; // Redmineのチケット型は必要に応じて定義
}>;

/**
 * Redmineチケット作成/更新用の共通データ
 */
interface RedmineIssueCommonData {
  subject?: string;
  description?: string;
  status_id?: number | string;
  tracker_id?: number | string;
  priority_id?: number | string;
  parent_issue_id?: number;
  start_date?: string;
  due_date?: string;
  estimated_hours?: number;
  fixed_version_id?: number | string;
}

/**
 * Redmineチケット作成用のデータ
 */
export interface RedmineIssueData extends RedmineIssueCommonData {
  project_id: number | string;
  subject: string;
}

/**
 * Redmineチケット更新用のデータ
 */
export interface RedmineUpdateIssueData extends RedmineIssueCommonData {
  notes?: string;
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
  sort?: string;
}

/**
 * Redmineチケット一覧取得APIの返り値
 */
export interface RedmineIssueListResponse {
  issues: any[];
  total_count: number;
  offset: number;
  limit: number;
}

/**
 * Redmineチケット詳細取得APIの返り値
 */
export interface RedmineIssueDetailResponse {
  issue: any;
}

/**
 * Redmineチケット作成APIの返り値
 */
export interface RedmineCreateIssueResponse {
  issue: any;
}

/**
 * Redmineチケット更新APIの返り値
 */
export interface RedmineUpdateIssueResponse {
  issue: any;
}
