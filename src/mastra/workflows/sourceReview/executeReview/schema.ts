import { z } from 'zod';

export const uploadedFileSchema = z.object({
  id: z.string(),  // テキスト抽出前、アップロード直後にのみ使用される一時的なID
  name: z.string(),
  path: z.string(),
  type: z.string(),
  processMode: z.string().optional(),
  imageMode: z.string().optional(),
  imageData: z.array(z.string()).optional(),
});

export const extractedDocumentSchema = z.object({
  id: z.string(),  // テキスト抽出後、レビュー実行wf内でのみ使用される一時的なID
  cacheId: z.number().optional(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  processMode: z.enum(['text', 'image']).optional(),
  imageMode: z.enum(['merged', 'pages']).optional(),
  textContent: z.string().optional(),
  imageData: z.array(z.string()).optional(),
});
