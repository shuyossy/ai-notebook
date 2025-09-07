import {
  ReviewChecklistEdit,
  ReviewChecklistResultDisplay,
  ModalMode,
  UploadFile,
  DocumentType,
} from '@/types';
import { Source } from '@/db/schema';

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

// ReviewSourceModalのProps型
export interface ReviewSourceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
    additionalInstructions?: string,
    commentFormat?: string,
  ) => void;
  selectedReviewHistoryId: string | null;
  disabled?: boolean;
  modalMode: ModalMode;
  additionalInstructions: string;
  setAdditionalInstructions: (instructions: string) => void;
  commentFormat: string;
  setCommentFormat: (format: string) => void;
}

// ソースファイルセレクタのProps型
export interface SourceSelectorProps {
  sources: Source[];
  selectedSourceIds: number[];
  onChange: (sourceIds: number[]) => void;
}
