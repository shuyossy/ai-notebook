import { z } from 'zod';
import { AgentToolStatus } from './chat';

// 設定状態管理用の型定義
export type SettingsSavingState = 'saving' | 'done' | 'error';

export type SettingsSavingMessage = {
  id: string;
  type: 'info' | 'warning' | 'error';
  content: string;
};

/**
 * エージェントのブート状態を表す型
 */
export type SettingsSavingStatus = {
  state: SettingsSavingState;
  messages: SettingsSavingMessage[];
  tools: AgentToolStatus;
};

/**
 * パスの存在確認を行う関数
 * @param path 確認するパス
 * @returns パスが存在する場合はtrue、存在しない場合はfalse
 */
export const checkPathExists = async (path: string): Promise<boolean> => {
  // 画面上でのみ厳密にチェックする
  // 設定値を直接変更してエラーになる場合は、画面上にエラー文言を表示するため問題ない
  try {
    if (process && process.type !== 'renderer') return true;
  } catch (error) {}
  try {
    const result = await window.electron.fs.access(path);
    return result.success === true && result.data === true;
  } catch (error) {
    return false;
  }
};

// StdioServerParameters(Mastraで設定されているMCPサーバ設定)のZodスキーマ定義
// eslint-disable-next-line
export const McpSchema = z.record(
  z.union([
    z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
      cwd: z.string().optional(),
    }),
    z.object({
      url: z
        .string()
        .url()
        .transform((s) => new URL(s)),
    }),
  ]),
);

export type McpSchemaType = z.infer<typeof McpSchema>;

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
  registerDir: z.string().refine(
    async (path) => {
      if (path === '') return true; // 空文字は許容
      return await checkPathExists(path);
    },
    {
      message: '指定されたパスが存在しません',
    },
  ),
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
  serverConfig: z
    .string()
    .optional()
    .transform((str, ctx) => {
      try {
        if (!str || str.trim() === '') {
          return undefined;
        }
        const json = JSON.parse(str);
        const result = McpSchema.safeParse(json);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'MCP設定形式が不正です\n' +
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
    })
    .optional(),
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

export type Settings = z.infer<typeof SettingsSchema>;

export type ValidationError = {
  message: string;
  type: 'required' | 'format' | 'existence' | 'schema';
};

export type ValidationState = {
  [K in keyof z.infer<typeof SettingsSchema>]: {
    [F in keyof z.infer<typeof SettingsSchema>[K]]?: ValidationError;
  };
};
