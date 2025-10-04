import { z } from 'zod';

// 各ステップの共通出力スキーマ部分
export const baseStepOutputSchema = z.object({
  status: z.enum(['success', 'failed']),
  errorMessage: z.string().optional(),
});
