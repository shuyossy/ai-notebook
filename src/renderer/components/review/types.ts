import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
} from '../../../main/types';
import { Source } from '../../../db/schema';

// ReviewAreaのProps型
export interface ReviewAreaProps {
  selectedReviewHistoryId: string;
}

// ReviewChecklistSectionのProps型
export interface ReviewChecklistSectionProps {
  checklistResults: ReviewChecklistResult[];
  isLoading: boolean;
  onSave: (checklists: ReviewChecklistEdit[]) => Promise<void>;
}

export type ModalMode = 'extract' | 'review';

// ReviewSourceModalのProps型
export interface ReviewSourceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (sourceIds: number[]) => void;
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
