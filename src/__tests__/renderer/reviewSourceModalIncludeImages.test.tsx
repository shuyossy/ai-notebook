/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ReviewSourceModal from '@/renderer/components/review/ReviewSourceModal';
import { createMockElectronWithOptions } from './test-utils/mockElectronHandler';
import type { UploadFile, CustomEvaluationSettings } from '@/types';

// PDF Utilsのモック
jest.mock('@/renderer/lib/pdfUtils', () => ({
  convertPdfBytesToImages: jest.fn().mockResolvedValue([]),
  combineImages: jest.fn().mockResolvedValue(''),
}));

// File APIのモック
global.URL.createObjectURL = jest.fn(
  (blob: any) => `mock-url-${blob.name || 'file'}`,
);
global.URL.revokeObjectURL = jest.fn();

// テスト用のデフォルトprops
const createDefaultProps = (
  overrides?: Partial<Parameters<typeof ReviewSourceModal>[0]>,
) => ({
  open: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  selectedReviewHistoryId: 'review-1',
  disabled: false,
  modalMode: 'review' as const,
  additionalInstructions: '',
  setAdditionalInstructions: jest.fn(),
  commentFormat: '',
  setCommentFormat: jest.fn(),
  evaluationSettings: {
    items: [
      { label: 'A', description: '良い' },
      { label: 'B', description: '普通' },
    ],
  } as CustomEvaluationSettings,
  setEvaluationSettings: jest.fn(),
  ...overrides,
});

// ファイル選択のヘルパー: showOpenDialogを設定してファイル選択ボタンをクリック
const uploadFiles = async (filePaths: string[]) => {
  const uploadButton = screen.getByRole('button', {
    name: /ファイル選択ダイアログ/,
  });
  await act(async () => {
    fireEvent.click(uploadButton);
  });

  await waitFor(() => {
    // ファイル名（パスの末尾）が表示されていることを確認
    const fileName = filePaths[0].split(/[/\\]/).pop() || filePaths[0];
    expect(screen.getByText(fileName)).toBeInTheDocument();
  });
};

// Selectの値を変更するヘルパー（MUI Selectはmousedownで開く）
const changeSelectValue = async (
  selectElement: HTMLElement,
  optionName: string,
) => {
  await act(async () => {
    fireEvent.mouseDown(selectElement);
  });
  const listbox = await screen.findByRole('listbox');
  const option = within(listbox).getByText(optionName);
  await act(async () => {
    fireEvent.click(option);
  });
};

describe('ReviewSourceModal - includeImages機能', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('チェックボックスの表示条件', () => {
    it('テキストモードかつ画像抽出対応ファイル（.pdf）の場合、「画像を含める」チェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pdf']);

      // 「画像を含める」のテキストが表示される
      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });

    it('テキストモードかつ画像抽出対応ファイル（.docx）の場合、「画像を含める」チェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.docx'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.docx']);

      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });

    it('テキストモードかつ画像抽出対応ファイル（.xlsx）の場合、「画像を含める」チェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.xlsx'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.xlsx']);

      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });

    it('テキストモードかつ画像抽出対応ファイル（.pptx）の場合、「画像を含める」チェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pptx'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pptx']);

      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });

    it('画像抽出非対応ファイル（.txt）の場合、「画像を含める」チェックボックスが表示されないこと', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.txt'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.txt']);

      expect(screen.queryByText('画像を含める')).not.toBeInTheDocument();
    });

    it('画像化モードに切り替えた場合、「画像を含める」チェックボックスが表示されないこと', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pdf']);

      // 最初は「画像を含める」が表示されている
      expect(screen.getByText('画像を含める')).toBeInTheDocument();

      // ファイルの処理方法Selectを「画像化」に変更
      const listItem = screen.getByText('document.pdf').closest('li')!;
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // 「画像を含める」が非表示になる
      expect(screen.queryByText('画像を含める')).not.toBeInTheDocument();
    });
  });

  describe('チェックボックスのデフォルト値', () => {
    it('画像抽出対応ファイルのデフォルト値はfalse（チェックなし）であること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pdf']);

      // チェックボックスが未チェック状態であること
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('チェックボックスの操作', () => {
    it('チェックボックスをクリックしてincludeImagesをtrueに変更できること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pdf']);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      // チェックボックスをクリック
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(checkbox).toBeChecked();
    });
  });

  describe('一括操作', () => {
    it('一括設定で「画像を含める」を選択し適用すると、全対応ファイルのincludeImagesがtrueになること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file1.pdf', '/test/file2.docx', '/test/file3.txt'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles([
        '/test/file1.pdf',
        '/test/file2.docx',
        '/test/file3.txt',
      ]);

      // 初期状態: 対応ファイルのチェックボックスは未チェック
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox).not.toBeChecked();
      });

      // 一括設定の画像オプションSelectを「画像を含める」に変更
      const bulkImageOptionSelect = screen.getByLabelText('画像オプション');
      await changeSelectValue(bulkImageOptionSelect, '画像を含める');

      // 「すべてに適用」ボタンをクリック
      const applyButton = screen.getByRole('button', {
        name: 'すべてに適用',
      });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // 対応ファイルのチェックボックスがチェックされる
      const checkboxesAfter = screen.getAllByRole('checkbox');
      checkboxesAfter.forEach((checkbox) => {
        expect(checkbox).toBeChecked();
      });
    });

    it('一括設定で「画像を含めない」を選択し適用すると、全対応ファイルのincludeImagesがfalseになること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file1.pdf', '/test/file2.xlsx'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/file1.pdf', '/test/file2.xlsx']);

      // まず「画像を含める」で全てチェック
      const bulkImageOptionSelect = screen.getByLabelText('画像オプション');
      await changeSelectValue(bulkImageOptionSelect, '画像を含める');
      const applyButton = screen.getByRole('button', {
        name: 'すべてに適用',
      });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // 全チェック済み確認
      const checkboxesBefore = screen.getAllByRole('checkbox');
      checkboxesBefore.forEach((checkbox) => {
        expect(checkbox).toBeChecked();
      });

      // 「画像を含めない」に変更して再適用
      const bulkImageOptionSelect2 = screen.getByLabelText('画像オプション');
      await changeSelectValue(bulkImageOptionSelect2, '画像を含めない');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'すべてに適用' }));
      });

      // 全チェック解除確認
      const checkboxesAfter = screen.getAllByRole('checkbox');
      checkboxesAfter.forEach((checkbox) => {
        expect(checkbox).not.toBeChecked();
      });
    });
  });

  describe('onSubmitコールバックにincludeImagesが渡されること', () => {
    it('includeImages=trueの場合、onSubmitのfiles引数にincludeImages=trueが含まれること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });
      const mockOnSubmit = jest.fn();

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(
        <ReviewSourceModal
          {...createDefaultProps({ onSubmit: mockOnSubmit })}
        />,
      );
      await uploadFiles(['/test/document.pdf']);

      // 「画像を含める」をチェック
      const checkbox = screen.getByRole('checkbox');
      await act(async () => {
        fireEvent.click(checkbox);
      });
      expect(checkbox).toBeChecked();

      // 送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /ドキュメントレビュー実行/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
        const files = mockOnSubmit.mock.calls[0][0] as UploadFile[];
        expect(files).toHaveLength(1);
        expect(files[0].includeImages).toBe(true);
      });
    });

    it('includeImages=false（デフォルト）の場合、onSubmitのfiles引数にincludeImages=falseが含まれること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });
      const mockOnSubmit = jest.fn();

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(
        <ReviewSourceModal
          {...createDefaultProps({ onSubmit: mockOnSubmit })}
        />,
      );
      await uploadFiles(['/test/document.pdf']);

      // チェックボックスは未チェックのまま
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      // 送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /ドキュメントレビュー実行/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
        const files = mockOnSubmit.mock.calls[0][0] as UploadFile[];
        expect(files).toHaveLength(1);
        expect(files[0].includeImages).toBeFalsy();
      });
    });
  });

  describe('extractモードでの表示', () => {
    it('extractモードでも画像抽出対応ファイルの場合、「画像を含める」チェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(
        <ReviewSourceModal {...createDefaultProps({ modalMode: 'extract' })} />,
      );
      await uploadFiles(['/test/document.pdf']);

      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });
  });

  describe('混合ファイルタイプ時のチェックボックス表示', () => {
    it('対応ファイルと非対応ファイルが混在する場合、対応ファイルのみにチェックボックスが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file1.pdf', '/test/file2.txt'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/file1.pdf', '/test/file2.txt']);

      // チェックボックスは対応ファイル（pdf）分のみ表示される
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(1);

      // 「画像を含める」テキストが表示される
      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });
  });

  describe('モード切替時のリセット', () => {
    it('一括設定でテキストモードを適用した場合、includeImagesがfalseにリセットされること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewSourceModal {...createDefaultProps()} />);
      await uploadFiles(['/test/document.pdf']);

      // まず画像を含めるをチェック
      const checkbox = screen.getByRole('checkbox');
      await act(async () => {
        fireEvent.click(checkbox);
      });
      expect(checkbox).toBeChecked();

      // 一括設定でテキストモード（デフォルト・画像を含めない）を適用
      const applyButton = screen.getByRole('button', { name: 'すべてに適用' });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // チェックがリセット（false）されること
      const checkboxAfter = screen.getByRole('checkbox');
      expect(checkboxAfter).not.toBeChecked();
    });
  });
});
