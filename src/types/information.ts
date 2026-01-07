import { z } from 'zod';

/**
 * お知らせ項目のスキーマ
 */
export const InformationItemSchema = z.object({
  /** お知らせの一意識別子 */
  id: z.string().min(1, { message: 'IDは必須です' }),
  /** お知らせ本文（改行は\nで表現） */
  message: z.string().min(1, { message: 'メッセージは必須です' }),
  /** 表示順（小さい数字が上に表示） */
  order: z.number().int({ message: '表示順は整数である必要があります' }),
});

/**
 * お知らせ全体のスキーマ
 */
export const InformationSchema = z.object({
  informations: z.array(InformationItemSchema),
});

/**
 * お知らせ項目の型
 */
export type InformationItem = z.infer<typeof InformationItemSchema>;

/**
 * お知らせ全体の型
 */
export type Information = z.infer<typeof InformationSchema>;
