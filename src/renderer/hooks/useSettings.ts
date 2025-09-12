import { useState, useCallback, useEffect } from 'react';
import { z } from 'zod';
import {
  SettingsSchema,
  type Settings,
  type ValidationState,
  type ValidationError,
} from '@/types';
import { SettingsApi } from '../service/settingsApi';
import { useAgentStatusStore } from '../stores/agentStatusStore';
import { useAlertStore } from '../stores/alertStore';
import { getSafeErrorMessage, internalError } from '../lib/error';

/**
 * 設定値の型安全な管理と検証を行うフック
 */
const useSettingsStore = () => {
  // 設定値の状態管理
  const [settings, setSettings] = useState<Settings>({
    database: { dir: '' },
    source: { registerDir: './source' },
    api: { key: '', url: '', model: '' },
    redmine: { endpoint: '', apiKey: '' },
    gitlab: { endpoint: '', apiKey: '' },
    mcp: { serverConfig: undefined },
    systemPrompt: { content: '' },
  });

  // バリデーションエラーの状態管理
  const [validationErrors, setValidationErrors] = useState<ValidationState>({
    database: {},
    source: {},
    api: {},
    redmine: {},
    gitlab: {},
    mcp: {},
    systemPrompt: {},
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { setUpdatedFlg, setStatus: setAgentStatus } = useAgentStatusStore();

  // エージェント状態のポーリング制御
  const [agentStatusPolling, setAgentStatusPolling] = useState(false);
  const addAlert = useAlertStore((state) => state.addAlert);

  // SettingsApiインスタンス
  const settingsApi = SettingsApi.getInstance();

  /**
   * エージェント状態を取得する関数
   */
  const fetchAgentStatus = useCallback(async () => {
    const data = await settingsApi.getAgentStatus({
      showAlert: false,
      throwError: true,
    });
    if (data) {
      setAgentStatus(data);
    }
  }, [settingsApi, setAgentStatus]);

  /**
   * バリデーションエラーの種類を判定
   */
  const determineErrorType = (
    code: z.ZodIssueCode,
  ): ValidationError['type'] => {
    if (code === 'custom') return 'existence';
    if (code === 'invalid_type') return 'required';
    return 'format';
  };

  /**
   * セクション単位でのバリデーション実行
   */
  const validateSection = useCallback(
    async (section: keyof Settings, value: Settings[keyof Settings]) => {
      try {
        // セクションごとのスキーマを取得
        const schema = SettingsSchema.shape[section];
        await schema.parseAsync(value);

        // バリデーション成功時はエラーをクリア
        setValidationErrors((prev) => ({
          ...prev,
          [section]: {},
        }));
      } catch (err) {
        if (err instanceof z.ZodError) {
          // Zodのバリデーションエラーを整形
          const errors = err.errors.reduce(
            (acc, validationError) => {
              const field =
                validationError.path[validationError.path.length - 1];

              if (typeof field === 'string') {
                const validationErrorEntry = {
                  message: validationError.message,
                  type: determineErrorType(validationError.code),
                };

                (acc as Record<string, ValidationError>)[field] =
                  validationErrorEntry;
              }

              return acc;
            },
            {} as ValidationState[typeof section],
          );

          // エラー状態を更新
          setValidationErrors((prev) => ({
            ...prev,
            [section]: errors,
          }));
        }
      }
    },
    [],
  );

  // 設定値の読み込み
  useEffect(() => {
    setLoading(true);
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadSettings = async () => {
      try {
        const loadedSettings = await settingsApi.getSettings({
          showAlert: false,
          throwError: true,
        });

        if (loadedSettings) {
          setSettings(loadedSettings);

          // 各セクションのバリデーションを実行
          Object.entries(loadedSettings).forEach(([section, value]) => {
            validateSection(section as keyof Settings, value);
          });
        }

        setLoading(false);

        // 読み込み成功したらポーリングを停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        console.error('設定の読み込みに処理失敗しました:', err);
        // 失敗時はポーリングを継続（既に設定済みの場合は何もしない）
        if (!intervalId) {
          intervalId = setInterval(loadSettings, 5000);
        }
      }
    };

    // 初回読み込み
    loadSettings();

    // クリーンアップでポーリング停止
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [validateSection]);

  // エージェント状態の初回ポーリング処理（エラーが発生しなくなるまでポーリング継続）
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadAgentStatus = async () => {
      try {
        await fetchAgentStatus();
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        console.error('エージェント状態の取得に失敗しました:', error);
        // 失敗時はポーリングを継続（既に設定済みの場合は何もしない）
        if (!intervalId) {
          intervalId = setInterval(loadAgentStatus, 5000);
        }
      }
    };

    // 初回取得
    loadAgentStatus();

    // クリーンアップでポーリング停止
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchAgentStatus]);

  // 設定更新時のエージェント状態ポーリング処理
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (!agentStatusPolling) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }

    const pollAgentStatus = async () => {
      try {
        await fetchAgentStatus();
      } catch (error) {
        console.error(
          'エージェント状態のポーリング中にエラーが発生しました:',
          error,
        );
      }
    };

    // ポーリング開始
    intervalId = setInterval(pollAgentStatus, 5000);

    // クリーンアップでポーリング停止
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [agentStatusPolling, fetchAgentStatus]);

  /**
   * フィールドの更新処理
   */
  const updateField = useCallback(
    async (section: keyof Settings, field: string, value: unknown) => {
      // 設定値を更新
      setSettings((prev) => {
        const newSettings = {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value,
          },
        };

        // バリデーション実行
        validateSection(section, newSettings[section]);

        return newSettings;
      });
    },
    [validateSection],
  );

  /**
   * 全体のバリデーションチェック
   */
  const validateAll = async () => {
    try {
      await SettingsSchema.parseAsync(settings);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * 設定の保存処理
   */
  const saveSettings = async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);

    try {
      // 全体のバリデーションを実行
      const isValid = await validateAll();
      if (!isValid) {
        throw internalError('不正な設定値があります', {
          expose: true,
        });
      }

      const parsedSettings = await SettingsSchema.parseAsync(settings);

      // 設定を一括保存
      await settingsApi.setSettings(parsedSettings, {
        showAlert: false,
        throwError: true,
      });

      // 再初期化処理開始のキック
      settingsApi.reinitialize({
        showAlert: false,
        throwError: false, // エラーはイベントpushで処理するため
      });

      // 完了イベントの購読を開始（ワンショット）
      const unsubscribe = settingsApi.subscribeSettingsUpdateFinished(
        (payload: { success: boolean; error?: string }) => {
          // 設定更新完了時にポーリングを停止
          setAgentStatusPolling(false);

          try {
            fetchAgentStatus();
          } catch (error) {
            console.error('エージェント状態取得に失敗しました:', error);
            addAlert({
              message: getSafeErrorMessage(
                error,
                'AIツール起動情報の取得に失敗しました\n再度設定保存を実行してください',
              ),
              severity: 'error',
            });
          }

          if (!payload.success) {
            // 失敗時：エラー状態設定
            addAlert({
              message: `AIツールの初期化に失敗しました: ${payload.error || '不明なエラーが発生しました'}\n再度設定保存を実行してください`,
              severity: 'error',
            });
          }
          // 処理完了と同時に購読解除
          unsubscribe();
        },
      );

      setUpdatedFlg(true);

      // 設定更新後にポーリング開始
      setAgentStatusPolling(true);

      return true;
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : '設定保存処理で予期せぬエラーが発生しました',
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * すべてのバリデーションが通過しているかチェック
   */
  const isValid = Object.values(validationErrors).every(
    (sectionErrors) => Object.keys(sectionErrors).length === 0,
  );

  return {
    settings,
    validationErrors,
    loading,
    saveError,
    updateField,
    saveSettings,
    isValid,
    saving,
  };
};

export default useSettingsStore;
