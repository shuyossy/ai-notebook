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
      const newAlert: AlertMessage = {
        ...alert,
        id: uuidv4(),
        timestamp: Date.now(),
      };
      set((state) => ({
        alerts: [newAlert, ...state.alerts].slice(0, MAX_ALERT_MESSAGES),
      }));
    },

    removeAlert: (id) =>
      set((state) => ({ alerts: state.alerts.filter((e) => e.id !== id) })),

    clearAlerts: () => set({ alerts: [] }),
  }),
);

export const useAlertStore = <T>(
  selector: (s: AlertStore) => T,
) => useStore(alertStore, selector);
