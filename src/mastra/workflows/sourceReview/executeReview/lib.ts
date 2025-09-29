import { APICallError } from 'ai';
import { extractAIAPISafeError } from "@/main/lib/error";

export const getChecklistErrorMesssage = (checklist: { id: number; content: string }, errorMessage: string) => {
  return `・${checklist.content}:${errorMessage}`;
};

export const getChecklistsErrorMessage = (checklists: { id: number; content: string }[], errorMessage: string) => {
  return checklists.map((checklist) => getChecklistErrorMesssage(checklist, errorMessage)).join('\n');
}

export const judgeErrorIsContentLengthError = (error: unknown) => {
  const apiError = extractAIAPISafeError(error);
  if (!apiError) return false;
  if (APICallError.isInstance(apiError)) {
    return (
      apiError.responseBody?.includes('maximum context length') ||
      apiError.responseBody?.includes('token_limit_reached') ||
      apiError.responseBody?.includes('context_length_exceeded')
    );
  }
  return false;
}
