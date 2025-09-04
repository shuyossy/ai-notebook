import {
  ReviewChecklistEdit,
  ReviewChecklistResultDisplay,
} from '../../../main/types';
import { Source } from '../../../db/schema';

// ReviewAreaのProps型
export interface ReviewAreaProps {
  selectedReviewHistoryId: string | null;
}

// ReviewChecklistSectionのProps型
export interface ReviewChecklistSectionProps {
  checklistResults: ReviewChecklistResultDisplay[];
  isLoading: boolean;
  onSave: (checklists: ReviewChecklistEdit[]) => Promise<void>;
}

export type ModalMode = 'extract' | 'review';

// ドキュメント種別の定義
export type DocumentType = 'checklist' | 'general';

// PDF処理方式の定義
export type PdfProcessMode = 'text' | 'image';

// PDF画像化方式の定義
export type PdfImageMode = 'merged' | 'pages';

// アップロードファイル情報の型定義
export interface UploadFile {
  id: string;
  name: string;
  path: string;
  type: string;
  pdfProcessMode?: PdfProcessMode; // PDFファイルの場合のみ
  pdfImageMode?: PdfImageMode; // PDF画像化の場合のみ (merged: 統合画像, pages: ページ別画像)
  imageData?: string[]; // PDF画像変換時のBase64データ配列 (merged: 長さ1, pages: 各ページ)
}

// ReviewSourceModalのProps型
export interface ReviewSourceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
  ) => void;
  selectedReviewHistoryId: string | null;
  disabled?: boolean;
  modalMode: ModalMode;
}

// ソースファイルセレクタのProps型
export interface SourceSelectorProps {
  sources: Source[];
  selectedSourceIds: number[];
  onChange: (sourceIds: number[]) => void;
}
