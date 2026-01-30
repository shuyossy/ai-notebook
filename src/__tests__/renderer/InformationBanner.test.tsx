/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import InformationBanner from '@/renderer/components/common/InformationBanner';
import type { InformationItem } from '@/types';
import { createMockElectronWithOptions } from '@/__tests__/renderer/test-utils/mockElectronHandler';
import { informationStore } from '@/renderer/stores/informationStore';

// テスト用のモックデータ
const mockInformations: InformationItem[] = [
  {
    id: 'info-001',
    message: 'これはお知らせのサンプルです。',
    order: 1,
  },
  {
    id: 'info-002',
    message: '複数のお知らせを表示できます。',
    order: 2,
  },
];

// 改行を含むお知らせ
const mockInformationsWithNewline: InformationItem[] = [
  {
    id: 'info-newline',
    message: 'お知らせ1行目\nお知らせ2行目\nお知らせ3行目',
    order: 1,
  },
];

describe('InformationBanner Component', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    // ストアをリセット
    informationStore.setState({
      informations: [],
      loaded: false,
    });

    // Electronモックをデフォルト設定でセットアップ
    window.electron = createMockElectronWithOptions({
      informations: mockInformations,
    });
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ========================================
  // 正常系テスト
  // ========================================

  // テスト1: お知らせが正常に表示されること
  test('お知らせが正常に表示されること', async () => {
    render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // 各お知らせが表示されていることを確認
    await waitFor(() => {
      expect(
        screen.getByText('これはお知らせのサンプルです。'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('複数のお知らせを表示できます。'),
      ).toBeInTheDocument();
    });
  });

  // テスト2: 改行が正しく表示されること
  test('改行が正しく表示されること', async () => {
    // 改行を含むお知らせをセットアップ
    window.electron = createMockElectronWithOptions({
      informations: mockInformationsWithNewline,
    });

    render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // 改行を含むメッセージが表示されていることを確認
    await waitFor(() => {
      // 改行はwhiteSpace: 'pre-line'で表示されるため、テキストは1つの要素として存在
      expect(screen.getByText(/お知らせ1行目/)).toBeInTheDocument();
      expect(screen.getByText(/お知らせ2行目/)).toBeInTheDocument();
      expect(screen.getByText(/お知らせ3行目/)).toBeInTheDocument();
    });
  });

  // テスト3: ×ボタンでお知らせが閉じられること
  test('×ボタンでお知らせが閉じられること', async () => {
    render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // お知らせが表示されるのを待機
    await waitFor(() => {
      expect(
        screen.getByText('これはお知らせのサンプルです。'),
      ).toBeInTheDocument();
    });

    // 最初のお知らせの閉じるボタンをクリック
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]);

    // 最初のお知らせが非表示になることを確認
    await waitFor(() => {
      expect(
        screen.queryByText('これはお知らせのサンプルです。'),
      ).not.toBeInTheDocument();
    });

    // 2つ目のお知らせはまだ表示されていることを確認
    expect(
      screen.getByText('複数のお知らせを表示できます。'),
    ).toBeInTheDocument();
  });

  // テスト4: 全てのお知らせを閉じた場合、コンポーネントが非表示になること
  test('全てのお知らせを閉じた場合、コンポーネントが非表示になること', async () => {
    // 1つだけのお知らせをセットアップ
    window.electron = createMockElectronWithOptions({
      informations: [mockInformations[0]],
    });

    const { container } = render(<InformationBanner />);

    // お知らせが表示されるのを待機
    await waitFor(() => {
      expect(
        screen.getByText('これはお知らせのサンプルです。'),
      ).toBeInTheDocument();
    });

    // 閉じるボタンをクリック
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    // コンポーネントが空になることを確認（nullを返す）
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  // テスト5: 一度読み込み済みの場合、再度APIを呼び出さないこと
  test('一度読み込み済みの場合、再度APIを呼び出さないこと', async () => {
    // 最初のレンダリング
    const { unmount } = render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalledTimes(
        1,
      );
    });

    // コンポーネントをアンマウント
    unmount();

    // 再度レンダリング
    render(<InformationBanner />);

    // APIが再度呼び出されないことを確認（storeのloadedフラグがtrueのため）
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalledTimes(
        1,
      );
    });

    // お知らせが引き続き表示されていることを確認
    expect(
      screen.getByText('これはお知らせのサンプルです。'),
    ).toBeInTheDocument();
  });

  // ========================================
  // 異常系テスト
  // ========================================

  // テスト6: お知らせがない場合は何も表示しないこと
  test('お知らせがない場合は何も表示しないこと', async () => {
    // 空のお知らせをセットアップ
    window.electron = createMockElectronWithOptions({
      informations: [],
    });

    const { container } = render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // コンポーネントが空であることを確認
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  // テスト7: API呼び出しがnullを返した場合、何も表示しないこと
  test('API呼び出しがnullを返した場合、何も表示しないこと', async () => {
    // nullを返すモックをセットアップ
    window.electron.information.getInformations = jest.fn().mockResolvedValue({
      success: true,
      data: null,
    });

    const { container } = render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // コンポーネントが空であることを確認（nullの場合は空配列として扱われる）
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  // テスト8: API呼び出しが失敗した場合、何も表示しないこと
  test('API呼び出しが失敗した場合、何も表示しないこと', async () => {
    // エラーを返すモックをセットアップ
    window.electron.information.getInformations = jest
      .fn()
      .mockRejectedValue(new Error('API error'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { container } = render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // コンポーネントが空であることを確認
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });

    consoleSpy.mockRestore();
  });

  // テスト9: API呼び出しがsuccess: falseを返した場合、何も表示しないこと
  test('API呼び出しがsuccess: falseを返した場合、何も表示しないこと', async () => {
    // 失敗レスポンスを返すモックをセットアップ
    window.electron.information.getInformations = jest.fn().mockResolvedValue({
      success: false,
      error: { message: 'Failed to fetch informations', code: 'FETCH_FAILED' },
    });

    const { container } = render(<InformationBanner />);

    // お知らせ情報が取得されるまで待機
    await waitFor(() => {
      expect(window.electron.information.getInformations).toHaveBeenCalled();
    });

    // コンポーネントが空であることを確認
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
