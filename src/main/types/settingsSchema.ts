import { z } from 'zod';
import { McpSchema } from './schema';

/**
 * パスの存在確認を行う関数
 * @param path 確認するパス
 * @returns パスが存在する場合はtrue、存在しない場合はfalse
 */
export const checkPathExists = async (path: string): Promise<boolean> => {
  try {
    return await window.electron.fs.access(path);
  } catch {
    return false;
  }
};

/**
 * データベース設定のスキーマ
 */
export const DatabaseSchema = z.object({
  dir: z
    .string()
    .min(1, { message: 'データベースパスは必須です' })
    .refine(async (path) => await checkPathExists(path), {
      message: '指定されたパスが存在しません',
    }),
});

/**
 * ソース設定のスキーマ
 */
export const SourceSchema = z.object({
  registerDir: z
    .string()
    .refine(async (path) => {
      if (path === '') return true; // 空文字は許容
      return await checkPathExists(path)
    }, {
      message: '指定されたパスが存在しません',
    }),
});

/**
 * API設定のスキーマ
 */
export const ApiSchema = z.object({
  key: z.string().min(1, { message: 'APIキーは必須です' }),
  url: z.string().url({ message: '有効なURLを入力してください' }),
  model: z.string().min(1, { message: 'モデル名は必須です' }),
});

/**
 * Redmine設定のスキーマ
 */
export const RedmineSchema = z.object({
  endpoint: z
    .string()
    .url({ message: '有効なURLを入力してください' })
    .optional()
    .or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
});

/**
 * GitLab設定のスキーマ
 */
export const GitLabSchema = z.object({
  endpoint: z
    .string()
    .url({ message: '有効なURLを入力してください' })
    .optional()
    .or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
});

/**
 * システムプロンプト設定のスキーマ
 */
export const SystemPromptSchema = z.object({
  content: z.string(),
});

/**
 * MCP設定のスキーマ
 */
export const McpStoreSchema = z.object({
  serverConfigText: z
    .string()
    .min(1, { message: 'MCPサーバー設定は必須です' })
    .transform((str, ctx) => {
      try {
        const json = JSON.parse(str);
        const result = McpSchema.safeParse(json);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'MCP設定形式が不正です: ' +
              result.error.errors.map((err) => err.message).join(', '),
          });
          return z.NEVER;
        }
        return result.data;
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JSONの形式が不正です',
        });
        return z.NEVER;
      }
    }),
});

/**
 * 設定全体のスキーマ
 */
export const SettingsSchema = z.object({
  database: DatabaseSchema,
  source: SourceSchema,
  api: ApiSchema,
  redmine: RedmineSchema,
  gitlab: GitLabSchema,
  mcp: McpStoreSchema,
  systemPrompt: SystemPromptSchema,
});

export type ValidationError = {
  message: string;
  type: 'required' | 'format' | 'existence' | 'schema';
};

export type ValidationState = {
  [K in keyof z.infer<typeof SettingsSchema>]: {
    [F in keyof z.infer<typeof SettingsSchema>[K]]?: ValidationError;
  };
};
