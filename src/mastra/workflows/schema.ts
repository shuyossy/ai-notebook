import { z } from 'zod';

// 各ステップの共通出力スキーマ部分
export const baseStepOutputSchema = z.object({
  status: z.enum(['success', 'failed']),
  errorMessage: z.string().optional(),
});

// ドキュメント情報のスキーマ
export const documentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  pdfProcessMode: z.enum(['text', 'image']).optional(),
  pdfImageMode: z.enum(['merged', 'pages']).optional(),
  imageData: z.array(z.string()).optional(),
  workflowDocId: z.string().optional(),
});

// テキスト抽出ステップの出力スキーマ
export const textExtractionOutputSchema = baseStepOutputSchema.extend({
  extractedDocuments: z.array(
    z.object({
      workflowDocId: z.string(),
      name: z.string(),
      path: z.string(),
      content: z.string(),
      imageData: z.array(z.string()).optional(),
    })
  ).optional(),
});

// ドキュメント要約ステップの出力スキーマ
export const documentSummarizationOutputSchema = baseStepOutputSchema.extend({
  summaries: z.array(
    z.object({
      workflowDocId: z.string(),
      name: z.string(),
      topics: z.array(z.string()),
      summary: z.string(),
    })
  ).optional(),
});

// 大量ドキュメントレビューステップの出力スキーマ
export const largeDocumentReviewOutputSchema = baseStepOutputSchema.extend({
  reviewResults: z.array(
    z.object({
      checklistId: z.number(),
      evaluation: z.string(),
      comment: z.string(),
      fileId: z.string(),
      fileName: z.string(),
    })
  ).optional(),
});
