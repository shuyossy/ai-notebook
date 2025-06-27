import { create } from 'zustand';
import type { SettingsSavingStatus, MakeOptional } from '../../main/types';

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
    await window.electron.settings.removeMessage(messageId);
    // メッセージ削除後に最新のステータスを取得して更新
    const newStatus = await window.electron.settings.getStatus();
    set({ status: newStatus });
  },
}));
