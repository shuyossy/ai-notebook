// stores/errorStore.ts
import { createStore } from 'zustand/vanilla';
import { useStore, type StoreApi } from 'zustand';
import type { AlertColor } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

export interface AlertMessage {
  id: string;
  message: string;
  severity: AlertColor;
  timestamp: number;
  timerId?: NodeJS.Timeout; // 自動削除用タイマーID
}

interface AlertState {
  alerts: AlertMessage[];
}

interface AlertActions {
  addAlert: (alert: Omit<AlertMessage, 'id' | 'timestamp'>) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
}

export type AlertStore = AlertState & AlertActions;

const MAX_ALERT_MESSAGES = 4;

export const alertStore: StoreApi<AlertStore> = createStore<AlertStore>()(
  (set, get) => ({
    alerts: [],

    addAlert: (alert) => {
      const id = uuidv4();
      const newAlert: AlertMessage = {
        ...alert,
        id,
        timestamp: Date.now(),
      };

      // errorメッセージ以外は5秒後に自動削除
      if (alert.severity !== 'error' && alert.severity !== 'success') {
        const timerId = setTimeout(() => {
          get().removeAlert(id);
        }, 2000);
        newAlert.timerId = timerId;
      }

      set((state) => {
        const newAlerts = [newAlert, ...state.alerts].slice(
          0,
          MAX_ALERT_MESSAGES,
        );

        // 最大数を超えて削除されたアラートのタイマーもクリア
        const removedAlerts = [newAlert, ...state.alerts].slice(
          MAX_ALERT_MESSAGES,
        );
        removedAlerts.forEach((alert) => {
          if (alert.timerId) {
            clearTimeout(alert.timerId);
          }
        });

        return { alerts: newAlerts };
      });
    },

    removeAlert: (id) =>
      set((state) => {
        // 削除対象のアラートを見つけてタイマーをクリア
        const alertToRemove = state.alerts.find((alert) => alert.id === id);
        if (alertToRemove?.timerId) {
          clearTimeout(alertToRemove.timerId);
        }
        return { alerts: state.alerts.filter((e) => e.id !== id) };
      }),

    clearAlerts: () =>
      set((state) => {
        // 全てのタイマーをクリア
        state.alerts.forEach((alert) => {
          if (alert.timerId) {
            clearTimeout(alert.timerId);
          }
        });
        return { alerts: [] };
      }),
  }),
);

export const useAlertStore = <T>(selector: (s: AlertStore) => T) =>
  useStore(alertStore, selector);
