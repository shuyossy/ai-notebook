/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
});
