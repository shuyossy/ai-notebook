import { z } from 'zod';

// StdioServerParameters(Mastraで設定されているMCPサーバ設定)のZodスキーマ定義
// eslint-disable-next-line
export const McpSchema = z.record(
  z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
  }),
);

export type McpSchemaType = z.infer<typeof McpSchema>;
