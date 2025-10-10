import { z } from 'zod';

export const uploadedFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  processMode: z.string().optional(),
  imageMode: z.string().optional(),
  imageData: z.array(z.string()).optional(),
});

export const extractedDocumentSchema = z.object({
  id: z.string(),
  cacheId: z.number().optional(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  processMode: z.enum(['text', 'image']).optional(),
  imageMode: z.enum(['merged', 'pages']).optional(),
  textContent: z.string().optional(),
  imageData: z.array(z.string()).optional(),
});
