import { create } from 'zustand';
import type { AgentBootStatus } from '../../main/types';

type AgentStore = {
  // エージェントが更新されたかどうかを保持するフラグ
  updatedFlg: boolean;
  setUpdatedFlg: (updatedFlg: boolean) => void;
  status: AgentBootStatus;
  setStatus: (status: AgentBootStatus) => void;
  closeMessage: (messageId: string) => Promise<void>;
};

export const useAgentStore = create<AgentStore>((set) => ({
  updatedFlg: false,
  setUpdatedFlg: (updatedFlg: boolean) => {
    set({ updatedFlg });
  },
  status: { state: 'initializing', messages: [] },
  setStatus: (status: AgentBootStatus) => {
    set({ status });
  },
  closeMessage: async (messageId: string) => {
    await window.electron.agent.removeMessage(messageId);
    // メッセージ削除後に最新のステータスを取得して更新
    const newStatus = await window.electron.agent.getStatus();
    set({ status: newStatus });
  },
}));
