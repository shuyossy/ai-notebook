/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import SourceListModal from '../../renderer/components/common/SourceListModal';
import type { Source } from '../../db/schema';
import { ProcessStatus } from '../../main/types';
import { createMockElectronWithOptions } from '../../__tests__/test-utils/mockElectronHandler';

// テスト用のモックデータ
const mockSources: Source[] = [
  {
    id: 1,
    path: '/path/to/source1.md',
    title: 'Source 1',
    summary: 'Summary of source 1',
    createdAt: '2025-05-01T12:00:00.000Z',
    updatedAt: '2025-05-01T12:00:00.000Z',
    status: 'completed' as ProcessStatus,
    isEnabled: 1,
    error: null,
  },
  {
    id: 2,
    path: '/path/to/source2.md',
    title: 'Source 2',
    summary: 'Summary of source 2',
    createdAt: '2025-05-02T12:00:00.000Z',
    updatedAt: '2025-05-02T12:00:00.000Z',
    status: 'failed' as ProcessStatus,
    isEnabled: 0,
    error: 'Error processing file',
  },
  {
    id: 3,
    path: '/path/to/source3.md',
    title: 'Source 3',
    summary: 'Summary of source 3',
    createdAt: '2025-05-03T12:00:00.000Z',
    updatedAt: '2025-05-03T12:00:00.000Z',
    status: 'processing' as ProcessStatus,
    isEnabled: 1,
    error: null,
  },
];

describe('SourceListModal Component', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    window.electron = createMockElectronWithOptions({
      sources: mockSources,
    });

    // タイマーのモック
    jest.useFakeTimers();
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // 共通のプロップス
  const defaultProps = {
    open: true,
    processing: false,
    onClose: jest.fn(),
    onReloadSources: jest.fn(),
    onStatusUpdate: jest.fn(),
    showSnackbar: jest.fn(),
  };

  // テスト1: 正常にソース一覧を表示できること
  test('正常にソース一覧を表示できること', async () => {
    render(
      <SourceListModal
        open={defaultProps.open}
        processing={defaultProps.processing}
        onClose={defaultProps.onClose}
        onReloadSources={defaultProps.onReloadSources}
        onStatusUpdate={defaultProps.onStatusUpdate}
        showSnackbar={defaultProps.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // 各ソースが表示されていることを確認
    await waitFor(() => {
      expect(screen.getByText('/path/to/source1.md')).toBeInTheDocument();
      expect(screen.getByText('/path/to/source2.md')).toBeInTheDocument();
      expect(screen.getByText('/path/to/source3.md')).toBeInTheDocument();
      expect(screen.getByText('Source 1')).toBeInTheDocument();
      expect(screen.getByText('Source 2')).toBeInTheDocument();
      expect(screen.getByText('Source 3')).toBeInTheDocument();
    });

    // ステータスアイコンが表示されていることを確認
    expect(screen.getByText('完了')).toBeInTheDocument();
    expect(screen.getByText('エラー')).toBeInTheDocument();
    expect(screen.getByText('処理中')).toBeInTheDocument();

    // チェックボックスの初期状態を確認
    const checkboxes = screen.getAllByRole('checkbox');
    // 全選択チェックボックスをスキップして、各ソースのチェックボックスを確認
    expect(checkboxes[1]).toBeChecked(); // source1 (isEnabled: 1)
    expect(checkboxes[2]).not.toBeChecked(); // source2 (isEnabled: 0)
    expect(checkboxes[3]).toBeChecked(); // source3 (isEnabled: 1)
  });

  // テスト2: ソースのリロードボタンが機能すること
  test('処理中のソースがある場合は、ステータスが処理中と更新されること', async () => {
    render(
      <SourceListModal
        open={defaultProps.open}
        processing={defaultProps.processing}
        onClose={defaultProps.onClose}
        onReloadSources={defaultProps.onReloadSources}
        onStatusUpdate={defaultProps.onStatusUpdate}
        showSnackbar={defaultProps.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // onStatusUpdateが引数{processing: true, enableCount:1}で呼ばれることを確認
    expect(defaultProps.onStatusUpdate).toHaveBeenCalledWith({
      processing: true,
      enabledCount: 1,
    });
  });

  // テスト3: 処理中はUI要素が無効化されること
  test('処理中はUI要素が無効化されること', async () => {
    render(
      <SourceListModal
        open={defaultProps.open}
        processing={true}
        onClose={defaultProps.onClose}
        onReloadSources={defaultProps.onReloadSources}
        onStatusUpdate={defaultProps.onStatusUpdate}
        showSnackbar={defaultProps.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // リロードボタンが無効化されていることを確認
    const reloadButton = screen.getByText('同期処理中...');
    expect(reloadButton).toBeDisabled();

    // チェックボックスが無効化されていることを確認
    const allCheckboxes = screen.getAllByRole('checkbox');
    expect(allCheckboxes.length).toBeGreaterThan(0);

    for (const checkbox of allCheckboxes) {
      expect(checkbox).toBeDisabled();
    }
  });

  // テスト4: チェックボックスクリック時の動作検証
  test('チェックボックスクリック時の動作検証', async () => {
    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // 1つのチェックボックスを選択
    const checkboxes = screen.getAllByRole('checkbox');
    const sourceCheckbox = checkboxes[1]; // 最初のソースのチェックボックス

    // クリック前の状態を確保
    const wasChecked = (sourceCheckbox as HTMLInputElement).checked;

    // クリックしてチェックボックスが無効化されることを確認
    fireEvent.click(sourceCheckbox);
    expect(sourceCheckbox).toBeDisabled();

    // window.electron.source.updateSourceEnabledが呼ばれることを確認
    expect(window.electron.source.updateSourceEnabled).toHaveBeenCalledWith(
      mockSources[0].id,
      !wasChecked,
    );

    // 処理完了後にチェックボックスが再度有効化されることを確認
    await waitFor(() => {
      expect(sourceCheckbox).toBeEnabled();
    });
  });

  // テスト13: チェックボックス更新時にupdateSourceEnabledが例外をスローする場合
  test('チェックボックス更新時にupdateSourceEnabledが例外をスローする場合', async () => {
    // エラーをスローするように設定
    window.electron.source.updateSourceEnabled = jest
      .fn()
      .mockRejectedValue(new Error('API error occurred'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={defaultProps.open}
        processing={defaultProps.processing}
        onClose={defaultProps.onClose}
        onReloadSources={defaultProps.onReloadSources}
        onStatusUpdate={defaultProps.onStatusUpdate}
        showSnackbar={defaultProps.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // チェックボックスをクリック
    const sourceCheckboxes = screen.getAllByRole('checkbox');
    fireEvent.click(sourceCheckboxes[1]);

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'ソース状態の更新に失敗しました:',
        expect.any(Error),
      );
    });

    // チェックボックスが再度有効化されることを確認
    await waitFor(() => {
      expect(sourceCheckboxes[1]).toBeEnabled();
    });

    consoleSpy.mockRestore();
  });

  // テスト14: 全選択チェックボックス更新時にupdateSourceEnabledが例外をスローする場合
  test('全選択チェックボックス更新時にupdateSourceEnabledが例外をスローする場合', async () => {
    // エラーをスローするように設定
    window.electron.source.updateSourceEnabled = jest
      .fn()
      .mockRejectedValue(new Error('API error occurred'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: mockSources,
    });

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={defaultProps.open}
        processing={defaultProps.processing}
        onClose={defaultProps.onClose}
        onReloadSources={defaultProps.onReloadSources}
        onStatusUpdate={defaultProps.onStatusUpdate}
        showSnackbar={defaultProps.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // 全選択チェックボックスをクリック
    const sourceCheckboxes = screen.getAllByRole('checkbox');
    fireEvent.click(sourceCheckboxes[0]);

    // エラーログが出力されることを確認（各ソースごとにエラーが発生）
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'ソース状態の更新に失敗しました:',
        expect.any(Error),
      );
      expect(consoleSpy).toHaveBeenCalledTimes(mockSources.length);
    });

    // チェックボックスが再度有効化されることを確認
    await waitFor(() => {
      for (const checkbox of sourceCheckboxes) {
        expect(checkbox).toBeEnabled();
      }
    });

    consoleSpy.mockRestore();
  });

  // テスト5: 全選択チェックボックスの動作検証
  test('全選択チェックボックスの動作検証', async () => {
    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // 全選択チェックボックスを選択
    const checkboxes = screen.getAllByRole('checkbox');
    const allCheckbox = checkboxes[0]; // 全選択チェックボックス

    // クリック前の状態を確保（一つでもチェックが外れているか）
    const someUnchecked = Array.from(checkboxes)
      .slice(1)
      .some((cb) => !(cb as HTMLInputElement).checked);

    // クリックしてチェックボックスが無効化されることを確認
    fireEvent.click(allCheckbox);
    expect(allCheckbox).toBeDisabled();

    // すべてのチェックボックスが無効化されることを確認
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }

    // 各ソースのupdateSourceEnabledが呼ばれることを確認
    mockSources.forEach((source) => {
      expect(window.electron.source.updateSourceEnabled).toHaveBeenCalledWith(
        source.id,
        someUnchecked, // 一つでもチェックが外れていれば true (全選択)
      );
    });

    // 処理完了後にチェックボックスが再度有効化されることを確認
    await waitFor(() => {
      expect(allCheckbox).toBeEnabled();
      checkboxes.slice(1).forEach((checkbox) => {
        expect(checkbox).toBeEnabled();
      });
    });
  });

  // テスト7: チェックボックス更新失敗時のエラー表示
  test('チェックボックス更新失敗時のエラー表示', async () => {
    const props = {
      ...defaultProps,
    };

    // 更新失敗のモックを設定
    window.electron.source.updateSourceEnabled = jest.fn().mockResolvedValue({
      success: false,
      error: 'Update failed',
    });

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // チェックボックスをクリック
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(props.showSnackbar).toHaveBeenCalledWith(
        `${mockSources[0].path}の有効化/無効化に失敗しました: Update failed`,
        'error',
      );
    });

    // チェックボックスの状態が元に戻ることを確認
    await waitFor(() => {
      expect(checkboxes[1]).toBeChecked();
    });
  });

  // テスト8: 全選択チェックボックス更新失敗時のエラー表示
  test('全選択チェックボックス更新失敗時のエラー表示', async () => {
    const props = {
      ...defaultProps,
    };

    // 更新失敗のモックを設定
    window.electron.source.updateSourceEnabled = jest.fn().mockResolvedValue({
      success: false,
      error: 'Update failed',
    });

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // テーブルの内容がレンダリングされるまで待機
    await waitFor(() => {
      expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(1);
    });

    // 全選択チェックボックスをクリック
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(props.showSnackbar).toHaveBeenCalledWith(
        `${mockSources[0].path}の有効化/無効化に失敗しました: Update failed`,
        'error',
      );
      expect(props.showSnackbar).toHaveBeenCalledWith(
        `${mockSources[1].path}の有効化/無効化に失敗しました: Update failed`,
        'error',
      );
      expect(props.showSnackbar).toHaveBeenCalledWith(
        `${mockSources[2].path}の有効化/無効化に失敗しました: Update failed`,
        'error',
      );
    });

    // チェックボックスの状態が元に戻ることを確認
    await waitFor(() => {
      expect(checkboxes[1]).not.toBeChecked();
      expect(checkboxes[2]).not.toBeChecked();
      expect(checkboxes[3]).not.toBeChecked();
    });
  });

  // テスト9: 各ステータスアイコンの表示確認
  test('各ステータスアイコンの表示確認', async () => {
    const allStatusSources: Source[] = [
      {
        id: 1,
        path: '/path/to/source1.md',
        title: 'Source 1',
        summary: 'Summary of source 1',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
        status: 'completed' as ProcessStatus,
        isEnabled: 1,
        error: null,
      },
      {
        id: 2,
        path: '/path/to/source2.md',
        title: 'Source 2',
        summary: 'Summary of source 2',
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        status: 'failed' as ProcessStatus,
        isEnabled: 0,
        error: 'Error message',
      },
      {
        id: 3,
        path: '/path/to/source3.md',
        title: 'Source 3',
        summary: 'Summary of source 3',
        createdAt: '2025-05-03T12:00:00.000Z',
        updatedAt: '2025-05-03T12:00:00.000Z',
        status: 'processing' as ProcessStatus,
        isEnabled: 1,
        error: null,
      },
      {
        id: 4,
        path: '/path/to/source4.md',
        title: 'Source 4',
        summary: 'Summary of source 4',
        createdAt: '2025-05-04T12:00:00.000Z',
        updatedAt: '2025-05-04T12:00:00.000Z',
        status: 'idle',
        isEnabled: 1,
        error: null,
      },
      {
        id: 5,
        path: '/path/to/source5.md',
        title: 'Source 5',
        summary: 'Summary of source 5',
        createdAt: '2025-05-05T12:00:00.000Z',
        updatedAt: '2025-05-05T12:00:00.000Z',
        status: 'unknown' as any,
        isEnabled: 1,
        error: null,
      },
    ];

    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: allStatusSources,
    });

    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // データが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('/path/to/source1.md')).toBeInTheDocument();
    });

    // 各ステータスのアイコンとラベルが表示されていることを確認
    expect(screen.getByText('完了')).toBeInTheDocument();
    expect(screen.getByText('エラー')).toBeInTheDocument();
    expect(screen.getByText('処理中')).toBeInTheDocument();
    expect(screen.getByText('待機中')).toBeInTheDocument();
    expect(screen.getByText('不明')).toBeInTheDocument();

    // エラーツールチップのテスト
    // 「エラー」ラベルの Chip（Tooltip のトリガー）を取得
    const trigger = screen.getByTestId('sourcelistmodal-error-tooltip');

    // ホバーをシミュレートして Tooltip をオープン
    fireEvent.mouseEnter(trigger);

    // await で中身を取得して検証
    const tooltip = await screen.findByText('Error message');
    expect(tooltip).toBeInTheDocument();
  });

  // テスト10: 定期更新処理のエラーハンドリング
  test('定期更新処理のエラーハンドリング', async () => {
    const props = {
      ...defaultProps,
    };

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // 最初は成功、その後エラーを返すモック
    window.electron.source.getSources = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch sources'));

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 5秒進める（次の更新でエラー）
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'ソースデータの取得に失敗しました:',
        expect.any(Error),
      );
    });

    consoleSpy.mockRestore();
  });

  // テスト12: モーダルを閉じる機能の確認
  test('モーダルを閉じる機能の確認', async () => {
    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // バックドロップをクリック
    const backdrop = screen.getByRole('presentation').firstChild;
    fireEvent.click(backdrop as Element);

    // onCloseが呼ばれることを確認
    expect(props.onClose).toHaveBeenCalled();
  });

  // テスト6: 全てのソースが完了状態の場合のボタン制御
  test('全てのソースが完了状態の場合にソース読み込みボタンを押下できること', async () => {
    // 全て完了状態のモックデータを作成
    const allCompletedSources: Source[] = [
      {
        id: 1,
        path: '/path/to/source1.md',
        title: 'Source 1',
        summary: 'Summary of source 1',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
        status: 'completed',
        isEnabled: 1,
        error: null,
      },
      {
        id: 2,
        path: '/path/to/source2.md',
        title: 'Source 2',
        summary: 'Summary of source 2',
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        status: 'completed',
        isEnabled: 0,
        error: null,
      },
    ];

    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: allCompletedSources,
    });

    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // 完了状態なのでリロードボタンが活性化されていることを確認
    const reloadButton = screen.getByText('ファイル同期');
    expect(reloadButton).toBeEnabled();

    // リロードボタンをクリック
    fireEvent.click(reloadButton);

    // onReloadSourcesが呼ばれたことを確認
    await waitFor(() => {
      expect(props.onReloadSources).toHaveBeenCalled();
    });
  });

  // テスト11: 登録ディレクトリが空文字の場合のファイル同期挙動確認
  test('登録ディレクトリが空文字の場合のファイル同期挙動確認', async () => {
    // 登録ディレクトリが空文字のモックデータをセットアップ(window.electron.store.get('source'))
    window.electron.store.get = jest.fn().mockReturnValue({
      registerDir: '',
    });

    const props = {
      ...defaultProps,
    };

    // コンポーネントをレンダリング
    render(
      <SourceListModal
        open={props.open}
        processing={props.processing}
        onClose={props.onClose}
        onReloadSources={props.onReloadSources}
        onStatusUpdate={props.onStatusUpdate}
        showSnackbar={props.showSnackbar}
      />,
    );

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // ファイル同期ボタンが有効化されていることを確認
    const reloadButton = screen.getByText('ファイル同期');
    expect(reloadButton).toBeEnabled();

    // ファイル同期ボタンをクリック
    fireEvent.click(reloadButton);
    // 登録ディレクトリが設定されていない場合のエラーメッセージが表示されることを確認
    await waitFor(() => {
      expect(props.showSnackbar).toHaveBeenCalledWith(
        'ドキュメント登録ディレクトリが設定されていません',
        'error',
      );
    });
    // onReloadSourcesが呼ばれないことを確認
    await waitFor(() => {
      expect(props.onReloadSources).not.toHaveBeenCalled();
    });
  });
});
