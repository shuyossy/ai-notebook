import { createStore } from 'zustand/vanilla';
import { useStore, type StoreApi } from 'zustand';
import type { InformationItem } from '@/types';

/**
 * お知らせストアの状態
 */
interface InformationState {
  /** お知らせ一覧 */
  informations: InformationItem[];
  /** 読み込み済みフラグ */
  loaded: boolean;
}

/**
 * お知らせストアのアクション
 */
interface InformationActions {
  /** お知らせを設定する */
  setInformations: (informations: InformationItem[]) => void;
  /** お知らせを削除する（閉じた場合） */
  removeInformation: (id: string) => void;
}

export type InformationStore = InformationState & InformationActions;

/**
 * お知らせストア
 */
export const informationStore: StoreApi<InformationStore> =
  createStore<InformationStore>()((set) => ({
    informations: [],
    loaded: false,

    setInformations: (informations: InformationItem[]) => {
      set({ informations, loaded: true });
    },

    removeInformation: (id: string) => {
      set((state) => ({
        informations: state.informations.filter((info) => info.id !== id),
      }));
    },
  }));

/**
 * お知らせストアを利用するためのフック
 */
export const useInformationStore = <T>(selector: (s: InformationStore) => T) =>
  useStore(informationStore, selector);
