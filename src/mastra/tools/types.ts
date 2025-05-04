import { z } from 'zod';

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

export type RunToolStatus = 'success' | 'failed';
