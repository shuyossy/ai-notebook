/**
 * GitLab CI/CD操作ツール
 * パイプライン一覧取得・詳細取得、ジョブ一覧取得・詳細取得などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';

/**
 * パイプライン一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns パイプライン一覧取得ツール
 */
export const createGetPipelinesListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-pipelines-list',
    description: 'GitLabのCI/CDパイプライン一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      status: z
        .enum([
          'running',
          'pending',
          'success',
          'failed',
          'canceled',
          'skipped',
          'created',
          'manual',
        ])
        .optional()
        .describe('パイプラインの状態でフィルタリング'),
      ref: z.string().optional().describe('ブランチ名やタグ名でフィルタリング'),
      sha: z.string().optional().describe('コミットSHAでフィルタリング'),
      username: z.string().optional().describe('ユーザー名でフィルタリング'),
      updated_after: z
        .string()
        .optional()
        .describe(
          '指定日時以降に更新されたパイプラインのみ取得（ISO 8601形式）',
        ),
      updated_before: z
        .string()
        .optional()
        .describe(
          '指定日時以前に更新されたパイプラインのみ取得（ISO 8601形式）',
        ),
      order_by: z
        .enum(['id', 'status', 'ref', 'updated_at', 'created_at', 'user_id'])
        .optional()
        .default('id')
        .describe('ソート項目'),
      sort: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('ソート順（昇順：asc、降順：desc）'),
      per_page: z
        .number()
        .optional()
        .default(20)
        .describe('1ページあたりの取得数'),
      page: z.number().optional().default(1).describe('ページ番号'),
    }),
    outputSchema: z.object({
      pipelines: z.array(
        z.object({
          id: z.number(),
          iid: z.number(),
          project_id: z.number(),
          status: z.string(),
          ref: z.string(),
          sha: z.string(),
          web_url: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
        }),
      ),
      total: z.number(),
      page: z.number(),
      per_page: z.number(),
      total_pages: z.number(),
    }),
    execute: async ({ context }) => {
      const { pipelines } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // APIオプションを準備
      const options: any = {
        order_by: context.order_by || 'id',
        sort: context.sort || 'desc',
        per_page: context.per_page || 20,
        page: context.page || 1,
      };

      // フィルタオプションを追加
      if (context.status) {
        options.status = context.status;
      }

      if (context.ref) {
        options.ref = context.ref;
      }

      if (context.sha) {
        options.sha = context.sha;
      }

      if (context.username) {
        options.username = context.username;
      }

      if (context.updated_after) {
        options.updated_after = context.updated_after;
      }

      if (context.updated_before) {
        options.updated_before = context.updated_before;
      }

      // パイプライン一覧を取得
      const pipelinesList = await pipelines.all(projectId, {
        showExpanded: true,
        ...options,
      });

      // 新しいgitbeakerでは返り値の形式が異なるため、結果を適切に取り出す
      const data = Array.isArray(pipelinesList) ? pipelinesList : [];
      const paginationInfo = {
        total: data.length,
        current: context.page || 1,
        perPage: context.per_page || 20,
        totalPages: Math.ceil(data.length / (context.per_page || 20)),
      };

      return {
        pipelines: data.map((pipeline) => ({
          id: pipeline.id,
          iid: pipeline.iid,
          project_id: pipeline.project_id,
          status: pipeline.status,
          ref: pipeline.ref,
          sha: pipeline.sha,
          web_url: pipeline.web_url,
          created_at: pipeline.created_at,
          updated_at: pipeline.updated_at,
        })),
        total: paginationInfo.total,
        page: paginationInfo.current,
        per_page: paginationInfo.perPage,
        total_pages: paginationInfo.totalPages,
      };
    },
  });
};

/**
 * 特定のパイプライン詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns パイプライン詳細取得ツール
 */
export const createGetPipelineDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-pipeline-detail',
    description: 'GitLabの特定のCI/CDパイプライン詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      pipeline_id: z.number().describe('パイプラインID'),
    }),
    outputSchema: z.object({
      pipeline: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        status: z.string(),
        ref: z.string(),
        sha: z.string(),
        web_url: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
        started_at: z.string().nullable(),
        finished_at: z.string().nullable(),
        duration: z.number().nullable(),
        queued_duration: z.unknown().nullable(),
      }),
    }),
    execute: async ({ context }) => {
      const { pipelines } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // パイプライン詳細を取得
      const pipeline = await pipelines.show(projectId, context.pipeline_id);

      return {
        pipeline: {
          id: pipeline.id,
          iid: pipeline.iid,
          project_id: pipeline.project_id,
          status: pipeline.status,
          ref: pipeline.ref,
          sha: pipeline.sha,
          web_url: pipeline.web_url,
          created_at: pipeline.created_at,
          updated_at: pipeline.updated_at,
          started_at: pipeline.started_at,
          finished_at: pipeline.finished_at,
          duration: pipeline.duration,
          queued_duration: pipeline.queued_duration,
        },
      };
    },
  });
};

/**
 * パイプラインのジョブ一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns パイプラインのジョブ一覧取得ツール
 */
export const createGetPipelineJobsListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-pipeline-jobs-list',
    description: 'GitLabのCI/CDパイプラインのジョブ一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      pipeline_id: z.number().describe('パイプラインID'),
      scope: z
        .array(
          z.enum([
            'created',
            'pending',
            'running',
            'failed',
            'success',
            'canceled',
            'skipped',
            'manual',
          ]),
        )
        .optional()
        .describe('ジョブの状態でフィルタリング（複数指定可）'),
      include_retried: z
        .boolean()
        .optional()
        .default(false)
        .describe('リトライされたジョブも含めるか'),
    }),
    outputSchema: z.object({
      jobs: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          status: z.string(),
          stage: z.string(),
          created_at: z.string(),
          started_at: z.string().optional(),
          finished_at: z.string().optional(),
          duration: z.number().optional(),
          queued_duration: z.number().nullable(),
          pipeline: z.object({
            id: z.number(),
            project_id: z.number(),
            ref: z.string(),
            sha: z.string(),
            status: z.string(),
          }),
          ref: z.string(),
          web_url: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { jobs } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // APIオプションを準備
      const options: any = {
        include_retried: context.include_retried || false,
      };

      if (context.scope && context.scope.length > 0) {
        options.scope = context.scope.join(',');
      }

      // パイプラインのジョブ一覧を取得
      // GitBeakerの最新バージョンではshowPipelineJobsメソッドが存在しないため、
      // プロジェクトのジョブ一覧を取得して指定されたパイプラインに絞り込む
      const allJobs = await jobs.all(projectId, {
        showExpanded: true,
        ...options,
      });

      const jobsList = Array.isArray(allJobs)
        ? allJobs.filter(
            (job: any) =>
              job.pipeline && job.pipeline.id === context.pipeline_id,
          )
        : [];

      return {
        jobs: jobsList.map((job) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          stage: job.stage,
          created_at: job.created_at,
          started_at: job.started_at,
          finished_at: job.finished_at,
          duration: job.duration,
          queued_duration: job.queued_duration,
          pipeline: job.pipeline,
          ref: job.ref,
          web_url: job.web_url,
        })),
      };
    },
  });
};

/**
 * プロジェクトのジョブ一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns プロジェクトのジョブ一覧取得ツール
 */
export const createGetProjectJobsListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-project-jobs-list',
    description: 'GitLabプロジェクトのCI/CDジョブ一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      scope: z
        .array(
          z.enum([
            'created',
            'pending',
            'running',
            'failed',
            'success',
            'canceled',
            'skipped',
            'manual',
          ]),
        )
        .optional()
        .describe('ジョブの状態でフィルタリング（複数指定可）'),
      per_page: z
        .number()
        .optional()
        .default(20)
        .describe('1ページあたりの取得数'),
      page: z.number().optional().default(1).describe('ページ番号'),
    }),
    outputSchema: z.object({
      jobs: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          status: z.string(),
          stage: z.string(),
          created_at: z.string(),
          started_at: z.string().optional(),
          finished_at: z.string().optional(),
          duration: z.number().optional(),
          pipeline: z.object({
            id: z.number(),
            project_id: z.number(),
            ref: z.string(),
            sha: z.string(),
            status: z.string(),
          }),
          ref: z.string(),
          web_url: z.string(),
        }),
      ),
      total: z.number(),
      page: z.number(),
      per_page: z.number(),
      total_pages: z.number(),
    }),
    execute: async ({ context }) => {
      const { jobs } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // APIオプションを準備
      const options: any = {
        per_page: context.per_page || 20,
        page: context.page || 1,
      };

      if (context.scope && context.scope.length > 0) {
        options.scope = context.scope.join(',');
      }

      // プロジェクトのジョブ一覧を取得
      const jobsList = await jobs.all(projectId, {
        showExpanded: true,
        ...options,
      });

      // 新しいgitbeakerでは返り値の形式が異なるため、結果を適切に取り出す
      const data = Array.isArray(jobsList) ? jobsList : [];
      const paginationInfo = {
        total: data.length,
        current: context.page || 1,
        perPage: context.per_page || 20,
        totalPages: Math.ceil(data.length / (context.per_page || 20)),
      };

      return {
        jobs: data.map((job) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          stage: job.stage,
          created_at: job.created_at,
          started_at: job.started_at,
          finished_at: job.finished_at,
          duration: job.duration,
          pipeline: job.pipeline,
          ref: job.ref,
          web_url: job.web_url,
        })),
        total: paginationInfo.total,
        page: paginationInfo.current,
        per_page: paginationInfo.perPage,
        total_pages: paginationInfo.totalPages,
      };
    },
  });
};

/**
 * 特定のジョブ詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ジョブ詳細取得ツール
 */
export const createGetJobDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-job-detail',
    description: 'GitLabの特定のCI/CDジョブ詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      job_id: z.number().describe('ジョブID'),
    }),
    outputSchema: z.object({
      job: z.object({
        id: z.number(),
        name: z.string(),
        status: z.string(),
        stage: z.string(),
        created_at: z.string(),
        started_at: z.string().optional(),
        finished_at: z.string().optional(),
        duration: z.number().optional(),
        queued_duration: z.number().optional(),
        pipeline: z.object({
          id: z.number(),
          project_id: z.number(),
          ref: z.string(),
          sha: z.string(),
          status: z.string(),
        }),
        ref: z.string(),
        web_url: z.string(),
        runner: z
          .object({
            id: z.number(),
            description: z.string().nullable(),
            ip_address: z.string().nullable(),
            active: z.boolean(),
            is_shared: z.boolean(),
          })
          .nullable(),
        artifacts_file: z
          .object({
            filename: z.string(),
            size: z.number(),
          })
          .nullable(),
      }),
    }),
    execute: async ({ context }) => {
      const { jobs } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // ジョブ詳細を取得
      const job = await jobs.show(projectId, context.job_id);

      return {
        job: {
          id: job.id,
          name: job.name,
          status: job.status,
          stage: job.stage,
          created_at: job.created_at,
          started_at: job.started_at,
          finished_at: job.finished_at,
          duration: job.duration,
          queued_duration: job.queued_duration,
          pipeline: job.pipeline,
          ref: job.ref,
          web_url: job.web_url,
          runner: job.runner,
          artifacts_file: job.artifacts_file,
        },
      };
    },
  });
};

/**
 * パイプラインを実行するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns パイプライン実行ツール
 */
export const createRunPipelineTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-run-pipeline',
    description: 'GitLabのCI/CDパイプラインを実行します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      ref: z.string().describe('ブランチ名またはタグ名'),
      variables: z
        .array(
          z.object({
            key: z.string().describe('変数名'),
            value: z.string().describe('変数値'),
          }),
        )
        .optional()
        .describe('パイプラインに渡す変数（複数指定可）'),
    }),
    outputSchema: z.object({
      pipeline: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        status: z.string(),
        ref: z.string(),
        sha: z.string(),
        web_url: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { pipelines } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // パイプラインの実行パラメータを準備
      const pipelineParams: any = {
        ref: context.ref,
      };

      // 変数がある場合は追加
      if (context.variables && context.variables.length > 0) {
        pipelineParams.variables = context.variables;
      }

      // パイプラインを実行
      const pipeline = await pipelines.create(projectId, pipelineParams);

      return {
        pipeline: {
          id: pipeline.id,
          iid: pipeline.iid,
          project_id: pipeline.project_id,
          status: pipeline.status,
          ref: pipeline.ref,
          sha: pipeline.sha,
          web_url: pipeline.web_url,
          created_at: pipeline.created_at,
          updated_at: pipeline.updated_at,
        },
      };
    },
  });
};

/**
 * ジョブのアーティファクトを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ジョブアーティファクト取得ツール
 */
export const createGetJobArtifactsTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-job-artifacts',
    description: 'GitLabのCI/CDジョブのアーティファクト情報を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      job_id: z.number().describe('ジョブID'),
    }),
    outputSchema: z.object({
      artifacts: z.array(
        z.object({
          file_type: z.string(),
          size: z.number(),
          filename: z.string(),
          file_format: z.string().optional(),
        }),
      ),
      artifacts_file: z
        .object({
          filename: z.string(),
          size: z.number(),
        })
        .nullable(),
      artifact_size: z.number().nullable(),
    }),
    execute: async ({ context }) => {
      const { jobs } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // ジョブ詳細を取得（アーティファクト情報を含む）
      const job = await jobs.show(projectId, context.job_id);

      // 新しいGitBeakerではshowArtifactsメソッドが存在しないため、ジョブ詳細からアーティファクト情報を取得
      const artifacts = job.artifacts || [];

      return {
        artifacts: artifacts.map((artifact: any) => ({
          file_type: artifact.file_type,
          size: artifact.size,
          filename: artifact.filename,
          file_format: artifact.file_format,
        })),
        artifacts_file: job.artifacts_file,
        artifact_size: job.artifact_size,
      };
    },
  });
};

/**
 * GitLabのCI/CD変数一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns CI/CD変数一覧取得ツール
 */
export const createGetCiCdVariablesListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-ci-cd-variables-list',
    description: 'GitLabのプロジェクトレベルのCI/CD変数一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
    }),
    outputSchema: z.object({
      variables: z.array(
        z.object({
          key: z.string(),
          variable_type: z.enum(['env_var', 'file']),
          value: z.string(),
          protected: z.boolean(),
          masked: z.boolean(),
          environment_scope: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { projects } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // プロジェクトのCI/CD変数一覧を取得
      // 新しいGitBeakerではAPI呼び出し方法が変わっているため、プロジェクト変数APIは別途インポートが必要
      // ここでは直接projectsオブジェクトから呼び出せる方法に変更
      const variables = await projects.showVariables(projectId);

      return {
        variables: variables.map((variable: any) => ({
          key: variable.key,
          variable_type: variable.variable_type,
          value: variable.value,
          protected: variable.protected,
          masked: variable.masked,
          environment_scope: variable.environment_scope || '*',
        })),
      };
    },
  });
};

/**
 * GitLabのグループCI/CD変数一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns グループCI/CD変数一覧取得ツール
 */
export const createGetGroupCiCdVariablesListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-group-ci-cd-variables-list',
    description: 'GitLabのグループレベルのCI/CD変数一覧を取得します。',
    inputSchema: z.object({
      group_id: z
        .union([z.string(), z.number()])
        .describe('グループIDまたは名前'),
    }),
    outputSchema: z.object({
      variables: z.array(
        z.object({
          key: z.string(),
          variable_type: z.enum(['env_var', 'file']),
          value: z.string(),
          protected: z.boolean(),
          masked: z.boolean(),
          environment_scope: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { groups } = client.getApiResources();

      // グループIDを解決
      const groupId = await client.resolveGroupId(context.group_id);

      // グループのCI/CD変数一覧を取得
      // 新しいGitBeakerではAPI呼び出し方法が変わっているため、グループ変数APIは別途インポートが必要
      // ここでは直接groupsオブジェクトから呼び出せる方法に変更
      const variables = await groups.showVariables(groupId);

      return {
        variables: variables.map((variable: any) => ({
          key: variable.key,
          variable_type: variable.variable_type,
          value: variable.value,
          protected: variable.protected,
          masked: variable.masked,
          environment_scope: variable.environment_scope || '*',
        })),
      };
    },
  });
};

/**
 * GitLabのCI/CD操作ツール一式を作成する
 * @param client GitLabClient - GitLab APIクライアント
 * @returns CI/CD操作ツール一式
 */
export const createCiCdTools = (client: GitLabClient) => {
  return {
    getPipelinesList: createGetPipelinesListTool(client),
    getPipelineDetail: createGetPipelineDetailTool(client),
    getPipelineJobs: createGetPipelineJobsListTool(client),
    getProjectJobs: createGetProjectJobsListTool(client),
    getJobDetail: createGetJobDetailTool(client),
    runPipeline: createRunPipelineTool(client),
    getJobArtifacts: createGetJobArtifactsTool(client),
    getProjectCiCdVariables: createGetCiCdVariablesListTool(client),
    getGroupCiCdVariables: createGetGroupCiCdVariablesListTool(client),
  };
};
