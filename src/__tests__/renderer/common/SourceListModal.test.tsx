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

import SourceListModal from '../../../renderer/components/common/SourceListModal';
import { Source } from '../../../db/schema';

// テスト用のモックデータ
const mockSources: Source[] = [
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
    status: 'failed',
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
    status: 'processing',
    isEnabled: 1,
    error: null,
  },
];

describe('SourceListModal Component', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    // window.electron をモック
    window.electron = {
      source: {
        getSources: jest.fn().mockResolvedValue({
          success: true,
          sources: [],
        }),
        updateSourceEnabled: jest.fn().mockResolvedValue({
          success: true,
        }),
        reloadSources: jest.fn().mockResolvedValue({
          success: true,
          message: 'Source reloaded successfully',
        }),
      },
    } as any;

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
    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: mockSources,
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
      jest.advanceTimersByTime(3000);
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
  });

  // テスト2: ソースのリロードボタンが機能すること
  test('ソースのリロードボタンが機能すること', async () => {
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

    // リロードボタンをクリック
    const reloadButton = screen.getByText('ソース読み込み');
    fireEvent.click(reloadButton);

    // onReloadSourcesが呼ばれたことを確認
    expect(props.onReloadSources).toHaveBeenCalled();
  });

  // テスト3: 処理中はUI要素が無効化されること
  test('処理中はUI要素が無効化されること', async () => {
    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: mockSources,
    });

    const props = {
      ...defaultProps,
      processing: true,
    };

    // 処理中状態でコンポーネントをレンダリング
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
      jest.advanceTimersByTime(3000);
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
    const reloadButton = screen.getByText('処理中...');
    expect(reloadButton).toBeDisabled();

    // チェックボックスが無効化されていることを確認
    const allCheckboxes = screen.getAllByRole('checkbox');
    expect(allCheckboxes.length).toBeGreaterThan(0);

    for (const checkbox of allCheckboxes) {
      expect(checkbox).toBeDisabled();
    }
  });

  // テスト4: ソースのチェックボックスが1つでも選択された場合、リロードボタンと他のチェックボックスが無効化されること
  test('ソースのチェックボックスが1つでも選択された場合、リロードボタンと他のチェックボックスが無効化されること', async () => {
    const props = {
      ...defaultProps,
    };

    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: mockSources,
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
      jest.advanceTimersByTime(3000);
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
    fireEvent.click(checkboxes[1]); // 最初のチェックボックス（全選択以外）を選択

    // リロードボタンが無効化されていることを確認
    const reloadButton = screen.getByText('ソース読み込み');
    expect(reloadButton).toBeDisabled();

    // すべてのチェックボックスが無効化されていることを確認
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
  });

  // テスト5: 全選択チェックボックスが選択された場合、すべてのソースのチェックボックスが無効化されること
  test('全選択チェックボックスが選択された場合、すべてのソースのチェックボックスが無効化されること', async () => {
    const props = {
      ...defaultProps,
    };

    // モックデータをセットアップ
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: mockSources,
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
      jest.advanceTimersByTime(3000);
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
    fireEvent.click(checkboxes[0]); // 全選択チェックボックス

    // すべてのチェックボックスが無効化されていることを確認
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
  });
});
