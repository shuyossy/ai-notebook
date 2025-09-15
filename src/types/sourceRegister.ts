export interface Source {
  id: number;
  path: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  status: ProcessStatus;
  error: string | null;
  isEnabled: boolean;
}

export interface Topic {
  id: number;
  sourceId: number;
  name: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * プロセス状態を表す型
 */
export type ProcessStatus = 'idle' | 'processing' | 'completed' | 'failed';
