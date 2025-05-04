import { z } from 'zod';

/**
 * ツールの基本レスポンス型
 * 全てのツールの戻り値はこの型に従う
 */
export type BaseToolResponse<T = any> = {
  status: 'success' | 'failed';
  error?: string;
  result?: T;
};

/**
 * ツールの基本レスポンスのZodスキーマ
 * 型安全性を確保するために使用
 */
export const createBaseToolResponseSchema = <T extends z.ZodType>(
  resultSchema: T,
) =>
  z.object({
    status: z.enum(['success', 'failed']),
    error: z.string().optional(),
    result: resultSchema.optional(),
  });
