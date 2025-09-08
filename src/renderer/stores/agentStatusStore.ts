import { create } from 'zustand';
import type { SettingsSavingStatus, MakeOptional } from '@/types';
import { SettingsApi } from '../service/settingsApi';

type AgentStatusStore = {
  // エージェントが更新されたかどうかを保持するフラグ
  updatedFlg: boolean;
  setUpdatedFlg: (updatedFlg: boolean) => void;
  status: MakeOptional<SettingsSavingStatus, 'tools'>;
  setStatus: (status: MakeOptional<SettingsSavingStatus, 'tools'>) => void;
  closeMessage: (messageId: string) => Promise<void>;
};

export const useAgentStatusStore = create<AgentStatusStore>((set) => ({
  updatedFlg: false,
  setUpdatedFlg: (updatedFlg: boolean) => {
    set({ updatedFlg });
  },
  status: { state: 'saving', messages: [] },
  setStatus: (status: MakeOptional<SettingsSavingStatus, 'tools'>) => {
    set({ status });
  },
  closeMessage: async (messageId: string) => {
    const settingsApi = SettingsApi.getInstance();
    await settingsApi.removeMessage(messageId, {
      showAlert: false,
      throwError: false,
      printErrorLog: true,
    });
    // メッセージ削除後に最新のステータスを取得して更新
    const newStatus = await settingsApi.getAgentStatus({
      showAlert: false,
      throwError: false,
      printErrorLog: true,
    });
    if (newStatus) {
      set({ status: newStatus });
    }
  },
}));
