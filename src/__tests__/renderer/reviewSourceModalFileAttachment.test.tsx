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

// ファイル選択のヘルパー
const uploadFiles = async (filePaths: string[]) => {
  const uploadButton = screen.getByRole('button', {
    name: /ファイル選択ダイアログ/,
  });
  await act(async () => {
    fireEvent.click(uploadButton);
  });

  await waitFor(() => {
    const fileName = filePaths[0].split(/[/\\]/).pop() || filePaths[0];
    expect(screen.getByText(fileName)).toBeInTheDocument();
  });
};

// MUI Selectの値を変更するヘルパー
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

describe('ReviewSourceModal - ファイル添付UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('処理方法Selectドロップダウン表示', () => {
    it('PDF/Officeファイルには処理方法Selectが存在し、デフォルト値が「テキスト表現」であること', async () => {
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

      // 処理方法Selectが存在すること
      const listItem = screen.getByText('document.pdf').closest('li')!;
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      expect(processSelect).toBeInTheDocument();

      // デフォルト値が「テキスト表現」であること
      expect(processSelect).toHaveTextContent('テキスト表現');
    });

    it('.txtファイルにはSelectがなく、「テキスト抽出」テキストが表示されること', async () => {
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

      // Selectが存在しないこと
      const listItem = screen.getByText('document.txt').closest('li')!;
      const selects = within(listItem).queryAllByRole('combobox');
      expect(selects).toHaveLength(0);

      // 「テキスト抽出」テキストが表示されること
      expect(within(listItem).getByText('テキスト抽出')).toBeInTheDocument();
    });
  });

  describe('処理方法Select操作', () => {
    it('画像化を選択すると画像化方式Selectが表示され、「画像を含める」チェックボックスが非表示になること', async () => {
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

      const listItem = screen.getByText('document.pdf').closest('li')!;

      // 初期状態: 画像化方式Selectは非表示、チェックボックスは表示
      expect(
        within(listItem).queryByRole('combobox', {
          name: /document\.pdfの画像化方式/,
        }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('画像を含める')).toBeInTheDocument();

      // 画像化に切り替え
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // 画像化方式Selectが表示される
      expect(
        within(listItem).getByRole('combobox', {
          name: /document\.pdfの画像化方式/,
        }),
      ).toBeInTheDocument();

      // 「画像を含める」チェックボックスが非表示になる
      expect(screen.queryByText('画像を含める')).not.toBeInTheDocument();
    });

    it('テキスト抽出に戻すと画像化方式Selectが非表示になり、チェックボックスが再表示されること', async () => {
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

      const listItem = screen.getByText('document.pdf').closest('li')!;

      // 画像化に切り替え
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // テキスト表現に戻す
      const processSelect2 = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect2, 'テキスト表現');

      // 画像化方式Selectが非表示
      expect(
        within(listItem).queryByRole('combobox', {
          name: /document\.pdfの画像化方式/,
        }),
      ).not.toBeInTheDocument();

      // チェックボックスが再表示
      expect(screen.getByText('画像を含める')).toBeInTheDocument();
    });
  });

  describe('画像化方式Select操作', () => {
    it('画像化選択後、デフォルト値が「ページごと」であること', async () => {
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

      const listItem = screen.getByText('document.pdf').closest('li')!;
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // 画像化方式Selectのデフォルト値が「ページごと」
      const imageModeSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの画像化方式/,
      });
      expect(imageModeSelect).toHaveTextContent('ページごと');
    });

    it('統合を選択するとonSubmitでimageMode=mergedが渡されること', async () => {
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

      // readFileのモック（画像化時にPDF読み込みが必要）
      window.electron.fs.readFile = jest
        .fn()
        .mockResolvedValue({ success: true, data: new Uint8Array([1, 2, 3]) });

      render(
        <ReviewSourceModal
          {...createDefaultProps({ onSubmit: mockOnSubmit })}
        />,
      );
      await uploadFiles(['/test/document.pdf']);

      const listItem = screen.getByText('document.pdf').closest('li')!;

      // 画像化に切り替え
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // 統合を選択
      const imageModeSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの画像化方式/,
      });
      await changeSelectValue(imageModeSelect, '統合');

      // 送信
      const submitButton = screen.getByRole('button', {
        name: /ドキュメントレビュー実行/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
        const files = mockOnSubmit.mock.calls[0][0] as UploadFile[];
        expect(files[0].imageMode).toBe('merged');
        expect(files[0].processMode).toBe('image');
      });
    });
  });

  describe('一括設定', () => {
    it('一括処理方法Selectが表示され、テキストモード時は画像オプションSelectが表示されること', async () => {
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

      // 一括処理方法Selectが存在
      expect(screen.getByLabelText('変換形式')).toBeInTheDocument();

      // テキストモード時: 画像オプションSelectが表示
      expect(screen.getByLabelText('画像オプション')).toBeInTheDocument();

      // テキストモード時: 画像化方式Selectは非表示
      expect(screen.queryByLabelText('画像化方式')).not.toBeInTheDocument();
    });

    it('一括設定で画像化モードに切り替えると、画像化方式Selectが表示され、画像オプションSelectが非表示になること', async () => {
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

      // 画像化モードに切り替え
      const bulkProcessSelect = screen.getByLabelText('変換形式');
      await changeSelectValue(bulkProcessSelect, '画像');

      // 画像化方式Selectが表示される
      expect(screen.getByLabelText('画像化方式')).toBeInTheDocument();

      // 画像オプションSelectは非表示
      expect(screen.queryByLabelText('画像オプション')).not.toBeInTheDocument();
    });

    it('一括設定で「すべてに適用」を押すと全ファイルに正しく反映されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file1.pdf', '/test/file2.docx'],
        },
      });

      window.electron = createMockElectronWithOptions({});
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      // readFileのモック
      window.electron.fs.readFile = jest
        .fn()
        .mockResolvedValue({ success: true, data: new Uint8Array([1, 2, 3]) });

      const mockOnSubmit = jest.fn();
      render(
        <ReviewSourceModal
          {...createDefaultProps({ onSubmit: mockOnSubmit })}
        />,
      );
      await uploadFiles(['/test/file1.pdf', '/test/file2.docx']);

      // 一括設定で画像化・ページごとを選択して適用
      const bulkProcessSelect = screen.getByLabelText('変換形式');
      await changeSelectValue(bulkProcessSelect, '画像');

      const applyButton = screen.getByRole('button', {
        name: 'すべてに適用',
      });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // 各ファイルの処理方法Selectが「画像化」になっていること
      const file1ListItem = screen.getByText('file1.pdf').closest('li')!;
      const file1Select = within(file1ListItem).getByRole('combobox', {
        name: /file1\.pdfの処理方法/,
      });
      expect(file1Select).toHaveTextContent('画像');

      const file2ListItem = screen.getByText('file2.docx').closest('li')!;
      const file2Select = within(file2ListItem).getByRole('combobox', {
        name: /file2\.docxの処理方法/,
      });
      expect(file2Select).toHaveTextContent('画像');
    });
  });

  describe('テキスト表現説明Alert表示', () => {
    it('ファイルアップロード後にテキスト表現についての説明が表示されること', async () => {
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

      // テキスト抽出説明が表示される
      expect(screen.getByText('テキスト表現について')).toBeInTheDocument();
      expect(
        screen.getByText(
          /ファイル内のテキスト情報に加えて、以下の情報にアクセス可能な場合/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Infoアイコン表示', () => {
    it('「画像を含める」チェックボックス横にInfoアイコンが存在すること', async () => {
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

      // 「画像を含める」テキストが表示される
      const includeImagesLabel = screen.getByText('画像を含める');
      expect(includeImagesLabel).toBeInTheDocument();

      // 「画像を含める」の親要素内にInfoOutlinedアイコンが存在すること
      const labelContainer = includeImagesLabel.closest(
        '.MuiFormControlLabel-label',
      )!;
      expect(
        within(labelContainer as HTMLElement).getByTestId('InfoOutlinedIcon'),
      ).toBeInTheDocument();
    });

    it('一括設定のテキストモード時に画像オプション横のInfoアイコンが存在すること', async () => {
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

      // 一括設定の画像オプション横にInfoアイコンが存在すること
      expect(screen.getByTestId('bulk-image-option-info')).toBeInTheDocument();
    });

    it('一括設定の画像化モード時に画像化方式横のInfoアイコンが存在すること', async () => {
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

      // 画像化モードに切り替え
      const bulkProcessSelect = screen.getByLabelText('変換形式');
      await changeSelectValue(bulkProcessSelect, '画像');

      // 画像化方式横にInfoアイコンが存在すること
      expect(screen.getByTestId('bulk-image-mode-info')).toBeInTheDocument();
    });

    it('個別ファイルで画像化選択時に画像化方式横のInfoアイコンが存在すること', async () => {
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

      const listItem = screen.getByText('document.pdf').closest('li')!;

      // 画像化に切り替え
      const processSelect = within(listItem).getByRole('combobox', {
        name: /document\.pdfの処理方法/,
      });
      await changeSelectValue(processSelect, '画像');

      // 画像化方式横にInfoアイコンが存在すること
      expect(screen.getByTestId('file-image-mode-info')).toBeInTheDocument();
    });
  });
});
