import { useState, useCallback, useEffect, useMemo } from 'react';
import { z } from 'zod';
import type { StoreSchema as Settings } from '../../main/store';
import {
  SettingsSchema,
  type ValidationState,
  type ValidationError,
} from '../../main/types/settingsSchema';
import { useElectronStore } from './useElectronStore';
import { useAgentStore } from '../stores/agentStore';

/**
 * 設定値の型安全な管理と検証を行うフック
 */
const useSettingsStore = () => {
  // 各セクションの設定値を取得
  const {
    value: databaseStore,
    loading: loadingDatabase,
    setValue: setDatabaseStore,
  } = useElectronStore<Settings['database']>('database');

  const {
    value: sourceStore,
    loading: loadingSource,
    setValue: setSourceStore,
  } = useElectronStore<Settings['source']>('source');

  const {
    value: apiStore,
    loading: loadingApi,
    setValue: setApiStore,
  } = useElectronStore<Settings['api']>('api');

  const {
    value: redmineStore,
    loading: loadingRedmine,
    setValue: setRedmineStore,
  } = useElectronStore<Settings['redmine']>('redmine');

  const {
    value: gitlabStore,
    loading: loadingGitlab,
    setValue: setGitlabStore,
  } = useElectronStore<Settings['gitlab']>('gitlab');

  const {
    value: mcpStore,
    loading: loadingMcp,
    setValue: setMcpStore,
  } = useElectronStore<Settings['mcp']>('mcp');

  const {
    value: systemPromptStore,
    loading: loadingSystemPrompt,
    setValue: setSystemPromptStore,
  } = useElectronStore<Settings['systemPrompt']>('systemPrompt');

  // ローディング状態の管理
  const loading =
    loadingDatabase ||
    loadingSource ||
    loadingApi ||
    loadingRedmine ||
    loadingGitlab ||
    loadingMcp ||
    loadingSystemPrompt;

  // 設定値の状態管理
  const [settings, setSettings] = useState<Settings>({
    database: { dir: '' },
    source: { registerDir: './source' },
    api: { key: '', url: '', model: '' },
    redmine: { endpoint: '', apiKey: '' },
    gitlab: { endpoint: '', apiKey: '' },
    mcp: { serverConfigText: '{}' },
    systemPrompt: { content: '' },
  });

  // 変更前の設定値を保持するstate
  // const [originalSettings, setOriginalSettings] = useState<Settings>({
  //   database: { dir: '' },
  //   source: { registerDir: './source' },
  //   api: { key: '', url: '', model: '' },
  //   redmine: { endpoint: '', apiKey: '' },
  //   gitlab: { endpoint: '', apiKey: '' },
  //   mcp: { serverConfigText: '{}' },
  //   systemPrompt: { content: '' },
  // });

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUpdatedFlg } = useAgentStore();

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

  // ストアからの値の更新を監視
  useEffect(() => {
    if (!loading) {
      const newSettings = {
        database: databaseStore ?? { dir: '' },
        source: sourceStore ?? { registerDir: '' },
        api: apiStore ?? { key: '', url: '', model: '' },
        redmine: redmineStore ?? { endpoint: '', apiKey: '' },
        gitlab: gitlabStore ?? { endpoint: '', apiKey: '' },
        mcp: {
          serverConfigText: mcpStore.serverConfigText ?? {
            serverConfigText: '{}',
          },
        },
        systemPrompt: systemPromptStore ?? { content: '' },
      };

      setSettings(newSettings);
      // setOriginalSettings(newSettings);

      // 各セクションのバリデーションを実行
      Object.entries(newSettings).forEach(([section, value]) => {
        validateSection(section as keyof Settings, value);
      });
    }
  }, [
    databaseStore,
    sourceStore,
    apiStore,
    redmineStore,
    gitlabStore,
    mcpStore,
    systemPromptStore,
    loading,
    validateSection,
  ]);

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
   * 設定が変更されたかどうかを判定する
   */
  // const hasSettingsChanged = useMemo(() => {
  //   return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  // }, [settings, originalSettings]);

  /**
   * Mastra初期化に関わる設定が変更されたかをチェック
   */
  // const requiresReinitialization = useMemo(() => {
  //   // 設定が変更されていない場合は初期化不要
  //   if (!hasSettingsChanged) {
  //     return false;
  //   }

  //   // システムプロンプトとドキュメントディレクトリ以外の変更があるかチェック
  //   const hasChanges = Object.entries(settings).some(([key, value]) => {
  //     if (key === 'systemPrompt' || key === 'source') {
  //       return false;
  //     }
  //     return (
  //       JSON.stringify(value) !==
  //       JSON.stringify(originalSettings[key as keyof Settings])
  //     );
  //   });

  //   // システムプロンプトまたはドキュメントディレクトリのみの変更の場合はfalse
  //   return hasChanges;
  // }, [settings, originalSettings, hasSettingsChanged]);

  /**
   * 設定の保存処理
   */
  const saveSettings = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      // 全体のバリデーションを実行
      const isValid = await validateAll();
      if (!isValid) {
        throw new Error('入力内容に誤りがあります');
      }

      // 各セクションの設定を保存
      await Promise.all([
        setDatabaseStore(settings.database),
        setSourceStore(settings.source),
        setApiStore(settings.api),
        setRedmineStore(settings.redmine),
        setGitlabStore(settings.gitlab),
        setMcpStore(settings.mcp),
        setSystemPromptStore(settings.systemPrompt),
      ]);

      // 必要な場合のみMastraを再初期化
      // if (requiresReinitialization) {
      //   await window.electron.agent.reinitialize();
      // }
      await window.electron.agent.reinitialize();
      setUpdatedFlg(true);

      // 新しい設定を元の設定として保存
      // setOriginalSettings(settings);

      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '不明なエラーが発生しました',
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
    error,
    updateField,
    saveSettings,
    isValid,
    saving,
  };
};

export default useSettingsStore;
