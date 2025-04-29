/**
 * GitLabリポジトリ操作ツール
 * ブランチ一覧取得・作成、タグ一覧取得、ファイルの取得、リポジトリツリー参照、コミット履歴取得などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';
import { GitLabCommit, GitLabDiff, GitLabTreeItem } from './types';

/**
 * ブランチ一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ブランチ一覧取得ツール
 */
export const createGetBranchesListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-branches-list',
    description: 'GitLabのブランチ一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      search: z
        .string()
        .optional()
        .describe('検索キーワード（ブランチ名の一部）'),
    }),
    outputSchema: z.object({
      branches: z.array(
        z.object({
          name: z.string(),
          merged: z.boolean(),
          protected: z.boolean(),
          default: z.boolean(),
          developers_can_push: z.boolean(),
          developers_can_merge: z.boolean(),
          web_url: z.string(),
          commit: z.object({
            id: z.string(),
            short_id: z.string(),
            title: z.string(),
            author_name: z.string(),
            created_at: z.string(),
          }),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { projects, branches } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // ブランチ一覧を取得
      const options: any = {};
      if (context.search) {
        options.search = context.search;
      }

      const branchesList = await branches.all(projectId, options);

      // プロジェクト情報を取得してデフォルトブランチを確認
      const projectInfo = await projects.show(projectId);
      const defaultBranchName = projectInfo.default_branch;

      // レスポンス形式に整形
      return {
        branches: branchesList.map((branch) => ({
          name: branch.name,
          merged: branch.merged,
          protected: branch.protected,
          default: branch.name === defaultBranchName,
          developers_can_push: branch.developers_can_push,
          developers_can_merge: branch.developers_can_merge,
          web_url: branch.web_url,
          commit: {
            id: branch.commit.id,
            short_id: branch.commit.short_id,
            title: branch.commit.title,
            author_name: branch.commit.author_name,
            created_at: branch.commit.created_at,
          },
        })),
      };
    },
  });
};

/**
 * 特定のブランチの詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ブランチ詳細取得ツール
 */
export const createGetBranchDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-branch-detail',
    description: 'GitLabの特定のブランチ詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      branch: z.string().describe('ブランチ名'),
    }),
    outputSchema: z.object({
      branch: z.object({
        name: z.string(),
        merged: z.boolean(),
        protected: z.boolean(),
        default: z.boolean(),
        developers_can_push: z.boolean(),
        developers_can_merge: z.boolean(),
        web_url: z.string(),
        commit: z.object({
          id: z.string(),
          short_id: z.string(),
          title: z.string(),
          author_name: z.string(),
          author_email: z.string(),
          created_at: z.string(),
          committed_date: z.string(),
          message: z.string(),
        }),
      }),
    }),
    execute: async ({ context }) => {
      const { projects, branches } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // ブランチ詳細を取得
      const branch = await branches.show(projectId, context.branch);

      // プロジェクト情報を取得してデフォルトブランチを確認
      const projectInfo = await projects.show(projectId);
      const defaultBranchName = projectInfo.default_branch;

      return {
        branch: {
          ...branch,
          default: branch.name === defaultBranchName,
        },
      };
    },
  });
};

/**
 * 新しいブランチを作成するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ブランチ作成ツール
 */
export const createCreateBranchTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-create-branch',
    description: 'GitLabに新しいブランチを作成します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      branch: z.string().describe('作成するブランチ名'),
      ref: z
        .string()
        .describe(
          'ブランチの元になるリファレンス（ブランチ名、タグ名、コミットSHA）',
        ),
    }),
    outputSchema: z.object({
      branch: z.object({
        name: z.string(),
        merged: z.boolean(),
        protected: z.boolean(),
        default: z.boolean(),
        developers_can_push: z.boolean(),
        developers_can_merge: z.boolean(),
        web_url: z.string(),
        commit: z.object({
          id: z.string(),
          short_id: z.string(),
          title: z.string(),
          author_name: z.string(),
          created_at: z.string(),
        }),
      }),
    }),
    execute: async ({ context }) => {
      const { projects, branches } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // 新しいブランチを作成
      const branch = await branches.create(
        projectId,
        context.branch,
        context.ref,
      );

      // プロジェクト情報を取得してデフォルトブランチを確認
      const projectInfo = await projects.show(projectId);
      const defaultBranchName = projectInfo.default_branch;

      return {
        branch: {
          name: branch.name,
          merged: branch.merged,
          protected: branch.protected,
          default: branch.name === defaultBranchName,
          developers_can_push: branch.developers_can_push,
          developers_can_merge: branch.developers_can_merge,
          web_url: branch.web_url,
          commit: {
            id: branch.commit.id,
            short_id: branch.commit.short_id,
            title: branch.commit.title,
            author_name: branch.commit.author_name,
            created_at: branch.commit.created_at,
          },
        },
      };
    },
  });
};

/**
 * タグ一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns タグ一覧取得ツール
 */
export const createGetTagsListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-tags-list',
    description: 'GitLabのタグ一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      search: z.string().optional().describe('検索キーワード（タグ名の一部）'),
      sort: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('ソート順（昇順：asc、降順：desc）'),
    }),
    outputSchema: z.object({
      tags: z.array(
        z.object({
          name: z.string(),
          message: z.string().optional(),
          target: z.string(),
          commit: z.object({
            id: z.string(),
            short_id: z.string(),
            title: z.string(),
            author_name: z.string(),
            created_at: z.string(),
          }),
          release: z
            .object({
              tag_name: z.string(),
              description: z.string(),
            })
            .optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { tags } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // タグ一覧を取得
      const options: any = {
        sort: context.sort || 'desc',
      };

      if (context.search) {
        options.search = context.search;
      }

      const tagsList = await tags.all(projectId, options);

      return {
        tags: tagsList.map((tag) => ({
          name: tag.name,
          message: tag.message,
          target: tag.target,
          commit: {
            id: tag.commit.id,
            short_id: tag.commit.short_id,
            title: tag.commit.title,
            author_name: tag.commit.author_name,
            created_at: tag.commit.created_at,
          },
          release: tag.release,
        })),
      };
    },
  });
};

/**
 * 特定のタグの詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns タグ詳細取得ツール
 */
export const createGetTagDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-tag-detail',
    description: 'GitLabの特定のタグ詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      tag: z.string().describe('タグ名'),
    }),
    outputSchema: z.object({
      tag: z.object({
        name: z.string(),
        message: z.string().optional(),
        target: z.string(),
        commit: z.object({
          id: z.string(),
          short_id: z.string(),
          title: z.string(),
          author_name: z.string(),
          author_email: z.string(),
          created_at: z.string(),
          committed_date: z.string(),
          message: z.string(),
        }),
        release: z
          .object({
            tag_name: z.string(),
            description: z.string(),
          })
          .optional(),
      }),
    }),
    execute: async ({ context }) => {
      const { tags } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // タグ詳細を取得
      const tag = await tags.show(projectId, context.tag);

      return { tag };
    },
  });
};

/**
 * リポジトリファイルを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ファイル取得ツール
 */
export const createGetFileContentTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-file-content',
    description: 'GitLabリポジトリの特定のファイル内容を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      file_path: z
        .string()
        .describe('ファイルパス（リポジトリルートからの相対パス）'),
      ref: z
        .string()
        .optional()
        .default('master')
        .describe('リファレンス（ブランチ名、タグ名、コミットSHA）'),
    }),
    outputSchema: z.object({
      file: z.object({
        file_name: z.string(),
        file_path: z.string(),
        size: z.number(),
        encoding: z.string(),
        content: z.string(),
        content_sha256: z.string(),
        ref: z.string(),
        blob_id: z.string(),
        commit_id: z.string(),
        last_commit_id: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { repositoryFiles } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // ファイル内容を取得
      const file = await repositoryFiles.show(
        projectId,
        context.file_path,
        context.ref || 'master',
      );

      return { file };
    },
  });
};

/**
 * リポジトリツリーを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns リポジトリツリー取得ツール
 */
export const createGetRepositoryTreeTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-repository-tree',
    description: 'GitLabリポジトリのディレクトリ構造（ツリー）を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      path: z
        .string()
        .optional()
        .describe('取得するディレクトリパス（リポジトリルートからの相対パス）'),
      ref: z
        .string()
        .optional()
        .default('master')
        .describe('リファレンス（ブランチ名、タグ名、コミットSHA）'),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe('サブディレクトリを再帰的に取得するか'),
    }),
    outputSchema: z.object({
      tree: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(['tree', 'blob']),
          path: z.string(),
          mode: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { repositories } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // オプションの設定
      const options: any = {
        ref: context.ref || 'master',
        recursive: context.recursive || false,
      };

      if (context.path) {
        options.path = context.path;
      }

      // リポジトリツリーを取得
      const treeItems = await repositories.tree(projectId, options);

      return {
        tree: treeItems.map((item: GitLabTreeItem) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          path: item.path,
          mode: item.mode,
        })),
      };
    },
  });
};

/**
 * コミット履歴を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns コミット履歴取得ツール
 */
export const createGetCommitHistoryTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-commit-history',
    description: 'GitLabリポジトリのコミット履歴を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      ref_name: z
        .string()
        .optional()
        .describe('リファレンス名（ブランチ名、タグ名）'),
      path: z
        .string()
        .optional()
        .describe('特定のファイルパスに関連するコミットのみ取得'),
      since: z
        .string()
        .optional()
        .describe('この日時以降のコミットを取得 (ISO 8601形式)'),
      until: z
        .string()
        .optional()
        .describe('この日時以前のコミットを取得 (ISO 8601形式)'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('取得するコミット数の上限'),
    }),
    outputSchema: z.object({
      commits: z.array(
        z.object({
          id: z.string(),
          short_id: z.string(),
          title: z.string(),
          author_name: z.string(),
          author_email: z.string(),
          authored_date: z.string(),
          committer_name: z.string(),
          committer_email: z.string(),
          committed_date: z.string(),
          created_at: z.string(),
          message: z.string(),
          parent_ids: z.array(z.string()),
          web_url: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { commits } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // オプションの設定
      const options: any = {
        max_results: context.limit || 20,
      };

      if (context.ref_name) {
        options.ref_name = context.ref_name;
      }

      if (context.path) {
        options.path = context.path;
      }

      if (context.since) {
        options.since = context.since;
      }

      if (context.until) {
        options.until = context.until;
      }

      // コミット履歴を取得
      const commitsList = await commits.all(projectId, options);

      return {
        commits: commitsList.map((commit: GitLabCommit) => ({
          id: commit.id,
          short_id: commit.short_id,
          title: commit.title,
          author_name: commit.author_name,
          author_email: commit.author_email,
          authored_date: commit.authored_date,
          committer_name: commit.committer_name,
          committer_email: commit.committer_email,
          committed_date: commit.committed_date,
          created_at: commit.created_at,
          message: commit.message,
          parent_ids: commit.parent_ids,
          web_url: commit.web_url,
        })),
      };
    },
  });
};

/**
 * 特定のコミットの詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns コミット詳細取得ツール
 */
export const createGetCommitDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-commit-detail',
    description: 'GitLabリポジトリの特定のコミット詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      commit_id: z.string().describe('コミットID（SHA）'),
    }),
    outputSchema: z.object({
      commit: z.object({
        id: z.string(),
        short_id: z.string(),
        title: z.string(),
        author_name: z.string(),
        author_email: z.string(),
        authored_date: z.string(),
        committer_name: z.string(),
        committer_email: z.string(),
        committed_date: z.string(),
        created_at: z.string(),
        message: z.string(),
        parent_ids: z.array(z.string()),
        web_url: z.string().optional(),
      }),
    }),
    execute: async ({ context }) => {
      const { commits } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // コミット詳細を取得
      const commit = await commits.show(projectId, context.commit_id);

      return { commit };
    },
  });
};

/**
 * コミット間の差分を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns Diff取得ツール
 */
export const createGetDiffTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-diff',
    description: 'GitLabリポジトリの2つのリファレンス間の差分を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      from: z
        .string()
        .describe('比較元のリファレンス（ブランチ名、タグ名、コミットSHA）'),
      to: z
        .string()
        .describe('比較先のリファレンス（ブランチ名、タグ名、コミットSHA）'),
      path: z.string().optional().describe('特定のファイルパスの差分のみ取得'),
    }),
    outputSchema: z.object({
      diffs: z.array(
        z.object({
          old_path: z.string(),
          new_path: z.string(),
          a_mode: z.string().nullable(),
          b_mode: z.string(),
          diff: z.string(),
          new_file: z.boolean(),
          renamed_file: z.boolean(),
          deleted_file: z.boolean(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { repositories } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // オプションの設定
      const options: any = {};

      if (context.path) {
        options.path = context.path;
      }

      // 差分を取得
      const compareResult = await repositories.compare(
        projectId,
        context.from,
        context.to,
        options,
      );

      return {
        diffs: compareResult.diffs.map((diff: GitLabDiff) => ({
          old_path: diff.old_path,
          new_path: diff.new_path,
          a_mode: diff.a_mode,
          b_mode: diff.b_mode,
          diff: diff.diff,
          new_file: diff.new_file,
          renamed_file: diff.renamed_file,
          deleted_file: diff.deleted_file,
        })),
      };
    },
  });
};

/**
 * GitLabのリポジトリ操作ツール一式を作成する
 * @param client GitLabClient - GitLab APIクライアント
 * @returns リポジトリ操作ツール一式
 */
export const createRepositoryTools = (client: GitLabClient) => {
  return {
    getBranchesList: createGetBranchesListTool(client),
    getBranchDetail: createGetBranchDetailTool(client),
    createBranch: createCreateBranchTool(client),
    getTagsList: createGetTagsListTool(client),
    getTagDetail: createGetTagDetailTool(client),
    getFileContent: createGetFileContentTool(client),
    getRepositoryTree: createGetRepositoryTreeTool(client),
    getCommitHistory: createGetCommitHistoryTool(client),
    getCommitDetail: createGetCommitDetailTool(client),
    getDiff: createGetDiffTool(client),
  };
};
