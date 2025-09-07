import { useCallback, useEffect } from 'react';
import { useSettingsZustandStore } from '../stores/settingsZustandStore';
import { SettingsApi } from '../service/settingsApi';

const useSettingsStatus = () => {
  const { status, setStatus, closeMessage, updatedFlg, setUpdatedFlg } =
    useSettingsZustandStore();

  // ポーリング処理
  const startPolling = useCallback(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const pollStatus = async () => {
      const settingsApi = SettingsApi.getInstance();
      const agentStatus = await settingsApi.getStatus({
        showAlert: false,
        throwError: false,
      });
      if (agentStatus) {
        setStatus(agentStatus);

        if (agentStatus.state !== 'saving') {
          clearInterval(intervalId);
          setUpdatedFlg(false);
        }
      }
    };

    // 初回実行
    pollStatus();
    intervalId = setInterval(pollStatus, 5000);
    return () => clearInterval(intervalId);
  }, [setStatus, setUpdatedFlg]);

  // 初期マウント時のポーリング
  useEffect(() => {
    return startPolling();
  }, [startPolling]);

  // 設定保存時のポーリング再開
  useEffect(() => {
    if (updatedFlg) {
      setStatus({ state: 'saving', messages: [] });
      startPolling();
    }
  }, [updatedFlg, setStatus, startPolling]);

  return {
    status,
    closeMessage,
  };
};

export default useSettingsStatus;
