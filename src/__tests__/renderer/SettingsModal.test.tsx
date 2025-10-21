/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import SettingsModal from '../../renderer/components/common/SettingsModal';
import { createMockElectronWithOptions } from './test-utils/mockElectronHandler';

describe('SettingsModal Component', () => {
  // 共通のプロップス
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onSettingsUpdated: jest.fn(),
    onValidChange: jest.fn(),
  };

  // テスト前のセットアップ
  beforeEach(() => {
    window.electron = createMockElectronWithOptions();
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
  });

  // テスト1: 正常に設定モーダルが表示され、初期値が設定されること
  test('正常に設定モーダルが表示され、初期値が設定されること', async () => {
    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 設定値が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // データベース設定
    await waitFor(() => {
      const dbPath = screen.getByRole('textbox', {
        name: 'データベース保存フォルダ',
      });
      expect(dbPath).toHaveValue('/test/db');
    });

    // ソース設定
    expect(screen.getByLabelText('ドキュメント格納フォルダ')).toHaveValue(
      './test/source',
    );

    // API設定
    const apiKeyInput = screen.getByLabelText('APIキー');
    expect(apiKeyInput).toHaveValue('test-api-key');
    expect(screen.getByLabelText('APIエンドポイントURL')).toHaveValue(
      'https://api.test.com',
    );
    expect(screen.getByLabelText('モデル名')).toHaveValue('test-model');

    // Redmine設定
    const redmineEndpoint = screen.getByLabelText('Redmineエンドポイント');
    const redmineApiKey = screen.getByLabelText('RedmineAPIキー');
    expect(redmineEndpoint).toHaveValue('https://redmine.test.com');
    expect(redmineApiKey).toHaveValue('test-redmine-key');

    // GitLab設定
    const gitlabEndpoint = screen.getByLabelText('GitLabエンドポイント');
    const gitlabApiKey = screen.getByLabelText('GitLabAPIキー');
    expect(gitlabEndpoint).toHaveValue('https://gitlab.test.com');
    expect(gitlabApiKey).toHaveValue('test-gitlab-key');

    // MCPサーバー設定 (文字列形式)
    // URLオブジェクトは自動的に末尾に'/'が追加される
    expect(screen.getByLabelText('MCPサーバー設定（JSON）')).toHaveValue(
      JSON.stringify({ testMcp: { url: 'https://mcp.test.com/' } }, null, 2),
    );

    // システムプロンプト設定
    expect(
      screen.getByLabelText('システムプロンプトのカスタマイズが可能です'),
    ).toHaveValue('test system prompt');
  });

  // テスト2: 設定値を更新して保存できること
  test('設定値を更新して保存できること', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // 全ての入力フィールドが有効になるまで待機
    await waitFor(() => {
      const apiKeyInput = screen.getByLabelText('APIキー');
      expect(apiKeyInput).toBeEnabled();
    });

    // API設定の更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    const apiEndpointInput = screen.getByLabelText('APIエンドポイントURL');
    const apiModelInput = screen.getByLabelText('モデル名');

    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'new-test-api-key');
    await user.clear(apiEndpointInput);
    await user.type(apiEndpointInput, 'https://new.api.test.com');
    await user.clear(apiModelInput);
    await user.type(apiModelInput, 'new-test-model');

    // データベース設定の更新
    const dbDirInput = screen.getByLabelText('データベース保存フォルダ');
    await user.clear(dbDirInput);
    await user.type(dbDirInput, '/new/test/db');

    // ソース設定の更新
    const sourceInput = screen.getByLabelText('ドキュメント格納フォルダ');
    await user.clear(sourceInput);
    await user.type(sourceInput, './new/test/source');

    // Redmine設定の更新
    const redmineEndpoint = screen.getByLabelText('Redmineエンドポイント');
    const redmineApiKey = screen.getByLabelText('RedmineAPIキー');

    await user.clear(redmineEndpoint);
    await user.type(redmineEndpoint, 'https://new.redmine.test.com');
    await user.clear(redmineApiKey);
    await user.type(redmineApiKey, 'new-test-redmine-key');

    // GitLab設定の更新
    const gitlabEndpoint = screen.getByLabelText('GitLabエンドポイント');
    const gitlabApiKey = screen.getByLabelText('GitLabAPIキー');

    await user.clear(gitlabEndpoint);
    await user.type(gitlabEndpoint, 'https://new.gitlab.test.com');
    await user.clear(gitlabApiKey);
    await user.type(gitlabApiKey, 'new-test-gitlab-key');

    // MCPサーバー設定の更新
    const mcpConfigInput = screen.getByLabelText('MCPサーバー設定（JSON）');
    const validMcpConfig = {
      weather: {
        command: 'npx',
        args: ['tsx', 'weather.ts'],
        env: { API_KEY: 'test-key' },
        cwd: '/test/weather',
      },
    };
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      JSON.stringify(validMcpConfig, null, 2).replace(/[{[]/g, '$&$&'),
    );

    // システムプロンプト設定の更新
    const systemPromptInput = screen.getByLabelText(
      'システムプロンプトのカスタマイズが可能です',
    );
    await user.clear(systemPromptInput);
    await user.type(systemPromptInput, 'new test system prompt');

    // 保存ボタンをクリック
    await waitFor(() => {
      expect(screen.getByText('保存')).toBeEnabled();
    });
    await user.click(screen.getByText('保存'));

    // 設定の一括保存が正しく呼ばれることを確認
    await waitFor(() => {
      const call = (window.electron.settings.setSettings as jest.Mock).mock.calls[0][0];

      // 保存された設定を検証（MCPは文字列からパースされたオブジェクト）
      expect(call.api).toEqual({
        key: 'new-test-api-key',
        url: 'https://new.api.test.com',
        model: 'new-test-model',
      });
      expect(call.database).toEqual({ dir: '/new/test/db' });
      expect(call.source).toEqual({ registerDir: './new/test/source' });
      expect(call.redmine).toEqual({
        endpoint: 'https://new.redmine.test.com',
        apiKey: 'new-test-redmine-key',
      });
      expect(call.gitlab).toEqual({
        endpoint: 'https://new.gitlab.test.com',
        apiKey: 'new-test-gitlab-key',
      });
      expect(call.systemPrompt).toEqual({ content: 'new test system prompt' });

      // MCPは文字列からパースされたオブジェクトになる
      expect(call.mcp.serverConfig).toEqual(validMcpConfig);
    });

    // エージェントの再初期化が呼ばれることを確認
    expect(window.electron.settings.reinitialize).toHaveBeenCalled();

    // コールバック関数が呼ばれることを確認
    expect(defaultProps.onSettingsUpdated).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onValidChange).toHaveBeenCalledWith(true);
  }, 60000);

  // テスト3: バリデーションエラーが正しく表示されること
  test('バリデーションエラーが正しく表示されること', async () => {
    // checkPathExists関数をモック化して、fsAccessの結果を使うようにする
    const settingModule = require('@/types/setting');
    jest.spyOn(settingModule, 'checkPathExists').mockImplementation(
      async (...args: unknown[]): Promise<boolean> => {
        const path = args[0] as string;
        const result = await window.electron.fs.access(path);
        return result.success === true && result.data === true;
      },
    );

    window.electron = createMockElectronWithOptions({
      fsAccess: false,
    });

    const user = userEvent.setup({ delay: null });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // 必須フィールドを空にする
    const apiKeyInput = screen.getByLabelText('APIキー');
    const apiEndpointInput = screen.getByLabelText('APIエンドポイントURL');
    const apiModelInput = screen.getByLabelText('モデル名');
    const dbDirInput = screen.getByLabelText('データベース保存フォルダ');

    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    // 必須フィールドをクリア
    await user.clear(apiKeyInput);
    await user.clear(apiEndpointInput);
    await user.clear(apiModelInput);
    await user.clear(dbDirInput);

    // 存在しないパスを入力（データベース設定）
    await user.type(dbDirInput, '/nonexistent/path');

    // 存在しないパスを入力（ソース設定）
    const sourceInput = screen.getByLabelText('ドキュメント格納フォルダ');
    await user.clear(sourceInput);
    await user.type(sourceInput, './nonexistent/source');

    // 無効なURL形式を入力
    const redmineEndpoint = screen.getByLabelText('Redmineエンドポイント');
    const gitlabEndpoint = screen.getByLabelText('GitLabエンドポイント');

    await user.clear(apiEndpointInput);
    await user.type(apiEndpointInput, 'invalid-url');
    await user.clear(redmineEndpoint);
    await user.type(redmineEndpoint, 'not-a-url');
    await user.clear(gitlabEndpoint);
    await user.type(gitlabEndpoint, 'wrong-url');

    // MCPサーバー設定の無効な形式をテスト
    const mcpConfigInput = screen.getByLabelText('MCPサーバー設定（JSON）');

    // 無効なJSON構文
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      '{ invalid json'.replace(/[{[]/g, '$&$&'),
    );

    // バリデーションエラーメッセージが表示されることを確認
    await waitFor(
      () => {
        // 必須フィールドのエラー
        expect(screen.getByText('APIキーは必須です')).toBeInTheDocument();
        expect(screen.getByText('モデル名は必須です')).toBeInTheDocument();

        // パス存在エラー（DB + ドキュメント登録フォルダ）
        expect(
          screen.getAllByText('指定されたパスが存在しません').length,
        ).toEqual(2);

        // 無効なURL形式のエラー
        expect(screen.getAllByText('有効なURLを入力してください').length).toEqual(
          3,
        );

        // MCPサーバー設定のエラー
        expect(screen.getByText('JSONの形式が不正です')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    // 保存ボタンが無効化されていることを確認
    expect(screen.getByText('保存')).toBeDisabled();

    // バリデーションエラー状態であることを確認
    await waitFor(() => {
      expect(defaultProps.onValidChange).toHaveBeenLastCalledWith(false);
    });

    // モックをクリーンアップ
    jest.restoreAllMocks();
  }, 30000);

  // テスト4: MCPスキーマのバリデーションエラーが正しく表示されること
  test('MCPスキーマのバリデーションエラーが正しく表示されること', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    const mcpConfigInput = screen.getByLabelText('MCPサーバー設定（JSON）');
    await waitFor(() => {
      expect(mcpConfigInput).toBeEnabled();
    });

    // 1. 不正なコマンド構造 (必須フィールドの欠如)
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      JSON.stringify(
        {
          weather: {
            wrong_field: 'value',
          },
        },
        null,
        2,
      ).replace(/[{[]/g, '$&$&'),
    );

    await waitFor(() => {
      const element = screen.getByText((content, element) =>
        content.includes('MCP設定形式が不正です'),
      );
      expect(element).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeDisabled();
    });

    // 2. 不正な引数フォーマット
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      JSON.stringify(
        {
          weather: {
            command: 'npx',
            args: 'not-an-array',
          },
        },
        null,
        2,
      ).replace(/[{[]/g, '$&$&'),
    );

    await waitFor(() => {
      const element = screen.getByText((content, element) =>
        content.includes('MCP設定形式が不正です'),
      );
      expect(element).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeDisabled();
    });

    // 3. 不正なURL形式
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      JSON.stringify(
        {
          service: {
            url: 'invalid-url',
          },
        },
        null,
        2,
      ).replace(/[{[]/g, '$&$&'),
    );

    await waitFor(() => {
      const element = screen.getByText((content, element) =>
        content.includes('MCP設定形式が不正です'),
      );
      expect(element).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeDisabled();
    });

    // 4. 不正な環境変数形式
    await user.clear(mcpConfigInput);
    await userEvent.type(
      mcpConfigInput,
      JSON.stringify(
        {
          weather: {
            command: 'npx',
            env: ['not', 'an', 'object'],
          },
        },
        null,
        2,
      ).replace(/[{[]/g, '$&$&'),
    );

    await waitFor(() => {
      const element = screen.getByText((content, element) =>
        content.includes('MCP設定形式が不正です'),
      );
      expect(element).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeDisabled();
    });

    // バリデーション失敗の状態を確認
    await waitFor(() => {
      expect(defaultProps.onValidChange).toHaveBeenLastCalledWith(false);
    });
  }, 20000);

  // テスト5: 保存に失敗した場合のエラー表示を確認
  test('保存に失敗した場合のエラー表示を確認', async () => {
    const user = userEvent.setup({ delay: null });

    // 設定の保存に失敗するようにモックを設定
    window.electron.settings.setSettings = jest
      .fn()
      .mockRejectedValue(new Error('Failed to save settings'));

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // APIキーを更新してバリデーション完了を待機
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    await user.type(apiKeyInput, 'new-api-key');

    // バリデーションの完了を待機
    await waitFor(() => {
      expect(defaultProps.onValidChange).toHaveBeenCalledWith(true);
    });

    // 保存ボタンが有効になることを確認
    await waitFor(() => {
      expect(screen.getByText('保存')).toBeEnabled();
    });

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('API通信に失敗しました')).toBeInTheDocument();
    });

    // モーダルが閉じられないことを確認
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  // テスト6: キャンセルボタンの動作を確認
  test('キャンセルボタンの動作を確認', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // APIキーを更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'new-api-key');

    // キャンセルボタンをクリック
    await user.click(screen.getByText('キャンセル'));

    // setSettings関数が呼ばれないことを確認
    expect(window.electron.settings.setSettings).not.toHaveBeenCalled();

    // モーダルが閉じられることを確認
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // テスト7: ローディング状態の表示を確認
  test('ローディング状態の表示を確認', async () => {
    // 設定の取得を遅延させる
    window.electron.settings.getSettings = jest.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: {
              database: { dir: '/test/db' },
              source: { registerDir: './test/source' },
              api: {
                key: 'test-api-key',
                url: 'https://api.test.com',
                model: 'test-model',
              },
              redmine: {
                endpoint: 'https://redmine.test.com',
                apiKey: 'test-redmine-key',
              },
              gitlab: {
                endpoint: 'https://gitlab.test.com',
                apiKey: 'test-gitlab-key',
              },
              mcp: {
                serverConfig: { testMcp: { url: new URL('https://mcp.test.com') } },
              },
              systemPrompt: { content: 'test system prompt' },
            },
          });
        }, 100);
      });
    });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 全ての入力フィールドが無効化されていることを確認
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });

    // データがロードされるまで待機
    await waitFor(
      () => {
        const textInputs = screen.getAllByRole('textbox');
        expect(textInputs[0]).toBeEnabled();
      },
      { timeout: 1000 },
    );
  });

  // テスト8: 保存中の状態表示を確認
  test('保存中の状態表示を確認', async () => {
    const user = userEvent.setup({ delay: null });

    // 設定の保存を遅延させる
    window.electron.settings.setSettings = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, data: true });
          }, 100);
        }),
    );

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // APIキーを更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'new-api-key');
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // バリデーション状態の確認
    await waitFor(
      () => {
        const { mock } = defaultProps.onValidChange as jest.Mock;
        expect(mock.calls[mock.calls.length - 1][0]).toBe(true);
      },
      { timeout: 5000 },
    );

    // 保存ボタンの状態を確認
    await waitFor(
      () => {
        const saveButton = screen.getByText('保存');
        expect(saveButton).toBeEnabled();
      },
      { timeout: 2000 },
    );

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // ボタンが無効化され、ローディングアイコンが表示されることを確認
    expect(screen.getByText('保存')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // 保存が完了するまで待機
    await waitFor(
      () => {
        expect(defaultProps.onClose).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );
  });

  // テスト9: 設定の取得に失敗した場合のエラー表示を確認
  test('設定の取得に失敗した場合のエラー表示を確認', async () => {
    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // 設定の取得に失敗するようにモックを設定
    window.electron.settings.getSettings = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get settings'));

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '設定の読み込みに処理失敗しました:',
        expect.any(Error),
      );
    });

    consoleSpy.mockRestore();
  });

  // テスト10: 初回設定データ取得がエラーの場合、ポーリングで初回データ取得を継続すること
  test('初回設定データ取得がエラーの場合、ポーリングで初回データ取得を継続すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 常にエラーを返すモック
    window.electron.settings.getSettings = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get settings'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // エラーログが出力されることを確認
    expect(consoleSpy).toHaveBeenCalledWith(
      '設定の読み込みに処理失敗しました:',
      expect.any(Error),
    );

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 2回目の呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(2);
    });

    // さらに5秒進める（ポーリング2回目）
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 3回目の呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(3);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト11: 初回設定データ取得が成功した場合は、ポーリングを解除すること
  test('初回設定データ取得が成功した場合は、ポーリングを解除すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 1回目はエラー、2回目以降は成功するモック
    window.electron.settings.getSettings = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to get settings'))
      .mockResolvedValue({
        success: true,
        data: {
          database: { dir: '/test/db' },
          source: { registerDir: './test/source' },
          api: {
            key: 'test-api-key',
            url: 'https://api.test.com',
            model: 'test-model',
          },
          redmine: {
            endpoint: 'https://redmine.test.com',
            apiKey: 'test-redmine-key',
          },
          gitlab: {
            endpoint: 'https://gitlab.test.com',
            apiKey: 'test-gitlab-key',
          },
          mcp: {
            serverConfig: { testMcp: { url: new URL('https://mcp.test.com') } },
          },
          systemPrompt: { content: 'test system prompt' },
        },
      });

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出し（エラー）を待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // 5秒進める前にマイクロタスクを処理してポーリングを設定
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 2回目の呼び出し（成功）を待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(2);
    });

    // さらに10秒進めてもそれ以上呼ばれないことを確認
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    // 少し待ってから確認
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(2);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト12: 初回エージェント状態取得がエラーの場合、ポーリングで取得を継続すること
  test('初回エージェント状態取得がエラーの場合、ポーリングで取得を継続すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // getStatusが常にエラーを返すモック
    window.electron.settings.getStatus = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get agent status'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalled();
    });

    // エラーログが出力されることを確認（invokeApiのログ）
    expect(consoleSpy).toHaveBeenCalledWith(
      'API通信に失敗しました:',
      expect.any(Error),
    );

    const initialCallCount = (window.electron.settings.getStatus as jest.Mock)
      .mock.calls.length;

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 呼び出し回数が増えることを確認
    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(initialCallCount);
    });

    const afterFirstPollCallCount = (
      window.electron.settings.getStatus as jest.Mock
    ).mock.calls.length;

    // さらに5秒進める（ポーリング2回目）
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // さらに呼び出し回数が増えることを確認
    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(afterFirstPollCallCount);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト13: エージェント状態が'saving'の場合、ポーリングで取得を継続すること
  test("エージェント状態が'saving'の場合、ポーリングで取得を継続すること", async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 最初2回は'saving'、3回目以降は'ready'を返すモック
    window.electron.settings.getStatus = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          state: 'saving' as const,
          messages: [],
          tools: {
            document: false,
            redmine: false,
            gitlab: false,
            mcp: false,
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          state: 'saving' as const,
          messages: [],
          tools: {
            document: false,
            redmine: false,
            gitlab: false,
            mcp: false,
          },
        },
      })
      .mockResolvedValue({
        success: true,
        data: {
          state: 'done' as const,
          messages: [],
          tools: {
            document: false,
            redmine: false,
            gitlab: false,
            mcp: false,
          },
        },
      });

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出しを待機（state: 'saving'）
    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalledTimes(1);
    });

    // エラーログが出力されることを確認（'saving'の場合もthrowされるのでログが出る）
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'エージェント状態の取得に失敗しました:',
        expect.any(Error),
      );
    });

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 2回目の呼び出しを待機（まだstate: 'saving'）
    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalledTimes(2);
    });

    // さらに5秒進める（ポーリング2回目）
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 3回目の呼び出しを待機（state: 'done'になる）
    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalledTimes(3);
    });

    // さらに10秒進めてもそれ以上呼ばれないことを確認（ポーリング停止）
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalledTimes(3);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト14: 初回エージェント状態取得が成功した場合は、ポーリングを解除すること
  test('初回エージェント状態取得が成功した場合は、ポーリングを解除すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 1回目はエラー、2回目以降は成功するモック
    window.electron.settings.getStatus = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to get agent status'))
      .mockResolvedValue({
        success: true,
        data: {
          state: 'done' as const,
          messages: [],
          tools: {
            document: false,
            redmine: false,
            gitlab: false,
            mcp: false,
          },
        },
      });

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出し（エラー）を待機
    await waitFor(() => {
      expect(window.electron.settings.getStatus).toHaveBeenCalled();
    });

    const initialCallCount = (window.electron.settings.getStatus as jest.Mock)
      .mock.calls.length;

    // 5秒進める前にマイクロタスクを処理してポーリングを設定
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 2回目の呼び出し（成功）を待機
    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(initialCallCount);
    });

    const afterSuccessCallCount = (
      window.electron.settings.getStatus as jest.Mock
    ).mock.calls.length;

    // さらに10秒進めてもそれ以上呼ばれないことを確認
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBe(afterSuccessCallCount);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト15: 保存ボタン押下後、settings-update-finishedイベントまでエージェント状態をポーリングすること
  test('保存ボタン押下後、settings-update-finishedイベントまでエージェント状態をポーリングすること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // pushApi.subscribeをモック化して、購読関数を保存
    let updateFinishedCallback: ((event: any) => void) | null = null;
    (window.electron.pushApi.subscribe as jest.Mock).mockImplementation(
      (channel, callback) => {
        if (channel === 'settings-update-finished') {
          updateFinishedCallback = callback;
        }
        return Promise.resolve(jest.fn()); // unsubscribe関数を返す
      },
    );

    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回データ読み込みを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
    });

    // APIキーを更新してバリデーション完了を待機
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    await user.type(apiKeyInput, 'new-api-key');

    // バリデーションの完了を待機
    await waitFor(() => {
      expect(defaultProps.onValidChange).toHaveBeenCalledWith(true);
    });

    // 保存前のgetStatus呼び出し回数を記録
    const beforeSaveCallCount = (window.electron.settings.getStatus as jest.Mock)
      .mock.calls.length;

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // pushApi.subscribeが呼ばれることを確認
    await waitFor(() => {
      expect(window.electron.pushApi.subscribe).toHaveBeenCalledWith(
        'settings-update-finished',
        expect.any(Function),
      );
    });

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(beforeSaveCallCount);
    });

    const afterFirstPollCallCount = (
      window.electron.settings.getStatus as jest.Mock
    ).mock.calls.length;

    // さらに5秒進める（ポーリング2回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(afterFirstPollCallCount);
    });

    // updateFinishedイベントを発火してポーリングを停止
    await act(async () => {
      if (updateFinishedCallback) {
        updateFinishedCallback({ payload: { success: true } });
      }
      await Promise.resolve();
    });

    const afterEventCallCount = (window.electron.settings.getStatus as jest.Mock)
      .mock.calls.length;

    // さらに10秒進めてもそれ以上呼ばれないことを確認
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => {
      // イベント発火後の最後のfetchAgentStatus呼び出し分（+1）を考慮
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeLessThanOrEqual(afterEventCallCount + 1);
    });

    jest.useRealTimers();
  }, 60000);

  // テスト16: settings-update-finishedイベント（成功）発行後、最後にエージェント状態取得を実行し、ポーリングを停止すること
  test('settings-update-finishedイベント（成功）発行後、最後にエージェント状態取得を実行し、ポーリングを停止すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // pushApi.subscribeをモック化
    let updateFinishedCallback: ((event: any) => void) | null = null;
    (window.electron.pushApi.subscribe as jest.Mock).mockImplementation(
      (channel, callback) => {
        if (channel === 'settings-update-finished') {
          updateFinishedCallback = callback;
        }
        return Promise.resolve(jest.fn()); // unsubscribe関数を返す
      },
    );

    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回データ読み込みを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
    });

    // APIキーを更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    await user.type(apiKeyInput, 'new-api-key');

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // 購読が開始されるまで待機
    await waitFor(() => {
      expect(window.electron.pushApi.subscribe).toHaveBeenCalledWith(
        'settings-update-finished',
        expect.any(Function),
      );
    });

    // イベント発火前の呼び出し回数を記録
    const beforeEventCallCount = (
      window.electron.settings.getStatus as jest.Mock
    ).mock.calls.length;

    // updateFinishedイベントを発火（成功）
    await act(async () => {
      if (updateFinishedCallback) {
        updateFinishedCallback({ payload: { success: true } });
      }
      await Promise.resolve();
    });

    // イベント発火後にfetchAgentStatusが呼ばれることを確認
    await waitFor(() => {
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(beforeEventCallCount);
    });

    jest.useRealTimers();
  }, 60000);

  // テスト17: settings-update-finishedイベント（失敗）発行後の挙動確認
  test('settings-update-finishedイベント（失敗）発行後の挙動確認', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // alertStore のスパイ
    const { alertStore } = require('@/renderer/stores/alertStore');
    const addAlertSpy = jest.spyOn(alertStore.getState(), 'addAlert');

    // pushApi.subscribeをモック化
    let updateFinishedCallback: ((event: any) => void) | null = null;
    (window.electron.pushApi.subscribe as jest.Mock).mockImplementation(
      (channel, callback) => {
        if (channel === 'settings-update-finished') {
          updateFinishedCallback = callback;
        }
        return Promise.resolve(jest.fn()); // unsubscribe関数を返す
      },
    );

    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回データ読み込みを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
    });

    // APIキーを更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    await user.type(apiKeyInput, 'new-api-key');

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // 購読が開始されるまで待機
    await waitFor(() => {
      expect(window.electron.pushApi.subscribe).toHaveBeenCalledWith(
        'settings-update-finished',
        expect.any(Function),
      );
    });

    addAlertSpy.mockClear();

    // updateFinishedイベントを発火（失敗）
    await act(async () => {
      if (updateFinishedCallback) {
        updateFinishedCallback({
          payload: {
            success: false,
            error: 'Initialization failed due to network error',
          },
        });
      }
      await Promise.resolve();
    });

    // エラーアラートが表示されることを確認
    await waitFor(() => {
      expect(addAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('AIツールの初期化に失敗しました'),
        }),
      );
    });

    addAlertSpy.mockRestore();
    jest.useRealTimers();
  }, 60000);

  // テスト18: ポーリング中のエージェント状態取得でエラーが発生した場合、ポーリングは継続されること
  test('ポーリング中のエージェント状態取得でエラーが発生した場合、ポーリングは継続されること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // pushApi.subscribeをモック化
    let updateFinishedCallback: ((event: any) => void) | null = null;
    (window.electron.pushApi.subscribe as jest.Mock).mockImplementation(
      (channel, callback) => {
        if (channel === 'settings-update-finished') {
          updateFinishedCallback = callback;
        }
        return Promise.resolve(jest.fn()); // unsubscribe関数を返す
      },
    );

    // 最初は成功、その後一度エラー、その後また成功するモック
    const getStatusMock = jest.fn();
    let callCount = 0;
    getStatusMock.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        // 2回目の呼び出しでエラー（ポーリング開始後の1回目）
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        success: true,
        data: {
          state: 'done' as const,
          messages: [],
          tools: {
            document: false,
            redmine: false,
            gitlab: false,
            mcp: false,
          },
        },
      });
    });
    window.electron.settings.getStatus = getStatusMock;

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

    render(
      <SettingsModal
        open={defaultProps.open}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回データ読み込みを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
    });

    // APIキーを更新
    const apiKeyInput = screen.getByLabelText('APIキー');
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });

    await user.type(apiKeyInput, 'new-api-key');

    // 保存ボタンをクリック
    await user.click(screen.getByText('保存'));

    // 購読が開始されるまで待機
    await waitFor(() => {
      expect(window.electron.pushApi.subscribe).toHaveBeenCalledWith(
        'settings-update-finished',
        expect.any(Function),
      );
    });

    // 5秒進める（ポーリング1回目：エラー）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getStatusMock).toHaveBeenCalledTimes(2);
    });

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'エージェント状態のポーリング中にエラーが発生しました:',
        expect.any(Error),
      );
    });

    // さらに5秒進める（ポーリング2回目：成功）
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // ポーリングが継続していることを確認
    await waitFor(() => {
      expect(getStatusMock).toHaveBeenCalledTimes(3);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  }, 60000);

  // テスト19: モーダルを閉じてもポーリングは継続すること
  test('モーダルを閉じてもポーリングは継続すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 常にエラーを返すモック（ポーリングが継続するようにする）
    window.electron.settings.getSettings = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get settings'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // コンポーネントをレンダリング
    const { rerender } = render(
      <SettingsModal
        open={true}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(1);
    });

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(2);
    });

    // モーダルを閉じる（open=falseに変更）
    rerender(
      <SettingsModal
        open={false}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // モーダルを閉じた後も5秒進める
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // モーダルを閉じた後もポーリングが継続することを確認
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalledTimes(3);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト20: コンポーネントがアンマウントされた際、全てのポーリングが停止すること
  test('コンポーネントがアンマウントされた際、全てのポーリングが停止すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 常にエラーを返すモック（ポーリングが継続するようにする）
    window.electron.settings.getSettings = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get settings'));

    window.electron.settings.getStatus = jest
      .fn()
      .mockRejectedValue(new Error('Failed to get agent status'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // コンポーネントをレンダリング
    const { unmount } = render(
      <SettingsModal
        open={true}
        onClose={defaultProps.onClose}
        onSettingsUpdated={defaultProps.onSettingsUpdated}
        onValidChange={defaultProps.onValidChange}
      />,
    );

    // 初回呼び出しを待機
    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
      expect(window.electron.settings.getStatus).toHaveBeenCalled();
    });

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electron.settings.getSettings).toHaveBeenCalled();
      expect(window.electron.settings.getStatus).toHaveBeenCalled();
    });

    const getSettingsCallCount = (
      window.electron.settings.getSettings as jest.Mock
    ).mock.calls.length;
    const getStatusCallCount = (
      window.electron.settings.getStatus as jest.Mock
    ).mock.calls.length;

    // コンポーネントをアンマウント
    unmount();

    // さらに10秒進める
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    // ポーリングが停止していることを確認（呼び出し回数が増えない）
    await waitFor(() => {
      expect(
        (window.electron.settings.getSettings as jest.Mock).mock.calls.length,
      ).toBe(getSettingsCallCount);
      expect(
        (window.electron.settings.getStatus as jest.Mock).mock.calls.length,
      ).toBe(getStatusCallCount);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });
});
