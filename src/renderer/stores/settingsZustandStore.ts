import { create } from 'zustand';
import type { SettingsSavingStatus, MakeOptional } from '@/types';
import { SettingsApi } from '../service/settingsApi';

type SettingsStore = {
  // エージェントが更新されたかどうかを保持するフラグ
  updatedFlg: boolean;
  setUpdatedFlg: (updatedFlg: boolean) => void;
  status: MakeOptional<SettingsSavingStatus, 'tools'>;
  setStatus: (status: MakeOptional<SettingsSavingStatus, 'tools'>) => void;
  closeMessage: (messageId: string) => Promise<void>;
};

export const useSettingsZustandStore = create<SettingsStore>((set) => ({
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
      showAlert: true,
      throwError: true,
    });
    // メッセージ削除後に最新のステータスを取得して更新
    const newStatus = await settingsApi.getStatus({
      showAlert: true,
      throwError: true,
    });
    if (newStatus) {
      set({ status: newStatus });
    }
  },
}));
