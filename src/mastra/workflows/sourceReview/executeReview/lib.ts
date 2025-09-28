export const getChecklistErrorMesssage = (checklist: { id: number; content: string }, errorMessage: string) => {
  return `・${checklist.content}:${errorMessage}`;
};

export const getChecklistsErrorMessage = (checklists: { id: number; content: string }[], errorMessage: string) => {
  return checklists.map((checklist) => getChecklistErrorMesssage(checklist, errorMessage)).join('\n');
}
