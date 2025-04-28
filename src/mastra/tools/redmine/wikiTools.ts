/**
 * RedmineのWikiページ操作ツール
 * Wikiページの取得、作成、更新などの操作を提供
 */

import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { RedmineClient } from './redmineClient';
import { RedmineWikiPage, RedmineWikiPageData } from './types';

/**
 * プロジェクトのWikiページ一覧を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns Wikiページ一覧取得ツール
 */
export const createGetWikiPagesListTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-wiki-pages-list',
    description: 'Redmineのプロジェクト内のWikiページ一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
    }),
    outputSchema: z.object({
      wiki_pages: z.array(
        z.object({
          title: z.string(),
          version: z.number(),
          created_on: z.string(),
          updated_on: z.string(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // API リクエストの実行
      const path = `projects/${projectId}/wiki/index.json`;
      const response = await client.request<{
        wiki_pages: {
          title: string;
          version: number;
          created_on: string;
          updated_on: string;
        }[];
      }>(path, 'GET');

      return {
        wiki_pages: response.wiki_pages,
      };
    },
  });
};

/**
 * 特定のWikiページを取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns Wikiページ取得ツール
 */
export const createGetWikiPageTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-wiki-page',
    description: 'Redmineの特定のWikiページを取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      wiki_page_title: z.string().describe('Wikiページのタイトル'),
      version: z
        .number()
        .optional()
        .describe('取得するバージョン（指定しない場合は最新バージョン）'),
    }),
    outputSchema: z.object({
      wiki_page: z.object({
        title: z.string(),
        parent: z
          .object({
            title: z.string(),
          })
          .optional(),
        text: z.string(),
        version: z.number(),
        author: z.object({
          id: z.number(),
          name: z.string(),
        }),
        comments: z.string().optional(),
        created_on: z.string(),
        updated_on: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // バージョン指定があれば追加
      const versionParam = context.version ? `/${context.version}` : '';

      // API リクエストの実行
      const path = `projects/${projectId}/wiki/${encodeURIComponent(context.wiki_page_title)}${versionParam}.json`;
      const response = await client.request<{ wiki_page: RedmineWikiPage }>(
        path,
        'GET',
      );

      return {
        wiki_page: response.wiki_page,
      };
    },
  });
};

/**
 * Wikiページを作成/更新するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns Wikiページ作成/更新ツール
 */
export const createUpdateWikiPageTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-update-wiki-page',
    description:
      'RedmineのWikiページを作成または更新します。ページが存在しない場合は新規作成され、存在する場合は更新されます。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      title: z.string().describe('Wikiページのタイトル'),
      text: z.string().describe('Wikiページの本文'),
      parent_title: z.string().optional().describe('親ページのタイトル'),
      comments: z.string().optional().describe('コミットメッセージ'),
      version: z
        .number()
        .optional()
        .describe('ベースとするバージョン（競合チェック用）'),
    }),
    outputSchema: z.object({
      wiki_page: z.object({
        title: z.string(),
        version: z.number(),
        created_on: z.string().optional(),
        updated_on: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // Wikiページデータの準備
      const wikiPageData: RedmineWikiPageData = {
        title: context.title,
        text: context.text,
      };

      if (context.parent_title) {
        wikiPageData.parent_title = context.parent_title;
      }

      if (context.comments) {
        wikiPageData.comments = context.comments;
      }

      if (context.version) {
        wikiPageData.version = context.version;
      }

      // API リクエストの実行
      try {
        const path = `projects/${projectId}/wiki/${encodeURIComponent(context.title)}.json`;
        const response = await client.request<{ wiki_page: RedmineWikiPage }>(
          path,
          'PUT',
          { wiki_page: wikiPageData },
        );

        return {
          wiki_page: {
            title: response.wiki_page.title,
            version: response.wiki_page.version,
            created_on: response.wiki_page.created_on,
            updated_on: response.wiki_page.updated_on,
          },
        };
      } catch (error) {
        // エラーハンドリング
        if (error instanceof Error) {
          if (error.message.includes('404')) {
            throw new Error(
              `Wikiページ「${context.title}」が見つかりません。プロジェクトにWikiモジュールが有効化されているか確認してください。`,
            );
          } else if (error.message.includes('422')) {
            throw new Error(
              '入力データが不正です。テキストが空でないか、親ページが存在するか確認してください。',
            );
          } else if (error.message.includes('409')) {
            throw new Error(
              '編集の競合が発生しました。最新バージョンを取得して再度試してください。',
            );
          }
        }
        throw error;
      }
    },
  });
};

/**
 * RedmineのWikiページ操作ツール一式を作成する
 * @param client RedmineClient - Redmine APIクライアント
 * @returns Wikiページ操作ツール一式
 */
export const createWikiTools = (client: RedmineClient) => {
  return {
    getWikiPagesList: createGetWikiPagesListTool(client),
    getWikiPage: createGetWikiPageTool(client),
    updateWikiPage: createUpdateWikiPageTool(client),
  };
};
