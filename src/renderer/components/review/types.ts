import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
  ModalMode,
  UploadFile,
  DocumentType,
  CustomEvaluationSettings,
  DocumentMode,
} from '@/types';

// ReviewAreaのProps型
export interface ReviewAreaProps {
  selectedReviewHistoryId: string | null;
}

// ReviewChecklistSectionのProps型
export interface ReviewChecklistSectionProps {
  checklistResults: ReviewChecklistResult[];
  isLoading: boolean;
  onSave: (checklists: ReviewChecklistEdit[]) => Promise<void>;
  targetDocumentName?: string | null;
}

// ReviewSourceModalのProps型
export interface ReviewSourceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
    documentMode?: DocumentMode,
    additionalInstructions?: string,
    commentFormat?: string,
    evaluationSettings?: CustomEvaluationSettings,
  ) => void;
  selectedReviewHistoryId: string | null;
  disabled?: boolean;
  modalMode: ModalMode;
  additionalInstructions: string;
  setAdditionalInstructions: (instructions: string) => void;
  commentFormat: string;
  setCommentFormat: (format: string) => void;
  evaluationSettings: CustomEvaluationSettings;
  setEvaluationSettings: (settings: CustomEvaluationSettings) => void;
}
