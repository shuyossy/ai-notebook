/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileProcessingResultSection from '@/renderer/components/review/FileProcessingResultSection';
import type { DocumentCacheInfo } from '@/types';

describe('FileProcessingResultSection', () => {
  const createCache = (
    overrides: Partial<DocumentCacheInfo> = {},
  ): DocumentCacheInfo => ({
    fileName: 'test.xlsx',
    processMode: 'text',
    formatType: 'xlsx-rich-v1',
    includeImages: true,
    textCharacterCount: 1500,
    extractedImageCount: 3,
    ...overrides,
  });

  describe('折りたたみ動作', () => {
    it('デフォルトで折りたたまれていること', () => {
      render(<FileProcessingResultSection documentCaches={[createCache()]} />);

      // トリガーは表示されている
      expect(screen.getByText('ファイル処理結果')).toBeInTheDocument();
      // MUI Collapseはin=falseでもDOMにはレンダリングするが、非表示になる
      expect(screen.getByText('ファイル名')).not.toBeVisible();
    });

    it('クリックで展開できること', () => {
      render(<FileProcessingResultSection documentCaches={[createCache()]} />);

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // テーブルが表示される
      expect(screen.getByText('ファイル名')).toBeVisible();
      expect(screen.getByText('処理モード')).toBeVisible();
      expect(screen.getByText('抽出文字数')).toBeVisible();
      expect(screen.getByText('test.xlsx')).toBeVisible();
    });
  });

  describe('リッチ戦略成功パターン', () => {
    it('xlsx-rich-v1のファイルで「成功」バッジが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: true,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('report.xlsx')).toBeInTheDocument();
      expect(screen.getByText('テキスト抽出')).toBeInTheDocument();
      expect(screen.getByText('あり')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
    });

    it('docx-rich-v1のファイルで「成功」バッジが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'document.docx',
              formatType: 'docx-rich-v1',
              includeImages: true,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('document.docx')).toBeInTheDocument();
      expect(screen.getByText('テキスト抽出')).toBeInTheDocument();
      expect(screen.getByText('あり')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
    });

    it('pptx-rich-v1のファイルで「成功」バッジが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'presentation.pptx',
              formatType: 'pptx-rich-v1',
              includeImages: true,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('presentation.pptx')).toBeInTheDocument();
      expect(screen.getByText('テキスト抽出')).toBeInTheDocument();
      expect(screen.getByText('あり')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
    });

    it('pdf-rich-v1のファイルで「成功」バッジが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.pdf',
              formatType: 'pdf-rich-v1',
              includeImages: true,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('テキスト抽出')).toBeInTheDocument();
      expect(screen.getByText('あり')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
    });

    it('リッチ成功+画像なし（includeImages=false）で「なし」が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('report.xlsx')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
      expect(screen.getByText('なし')).toBeInTheDocument();
    });
  });

  describe('フォールバックパターン', () => {
    it('xlsx-csv-v1にフォールバックしたファイルで「失敗」バッジと画像列ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-csv-v1',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('失敗')).toBeInTheDocument();
      // フォールバック時はファイル内画像・抽出画像数もハイフン表示（画像は抽出されていないため）
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });

    it('docx-plainにフォールバックしたファイルで「失敗」バッジと画像列ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'memo.docx',
              formatType: 'docx-plain',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('memo.docx')).toBeInTheDocument();
      expect(screen.getByText('失敗')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });

    it('pptx-plainにフォールバックしたファイルで「失敗」バッジと画像列ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'slide.pptx',
              formatType: 'pptx-plain',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('slide.pptx')).toBeInTheDocument();
      expect(screen.getByText('失敗')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });

    it('pdf-text-v1にフォールバックしたファイルで「失敗」バッジと画像列ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'document.pdf',
              formatType: 'pdf-text-v1',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('失敗')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });

    it('リッチ戦略対象ファイルでformatTypeがnullの場合「失敗」バッジが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: null,
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('report.xlsx')).toBeInTheDocument();
      expect(screen.getByText('失敗')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });
  });

  describe('対象外パターン', () => {
    it('画像変換モードの場合、ファイル内画像と画像・図形抽出と抽出画像数がハイフンで表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'scan.pdf',
              processMode: 'image',
              formatType: 'image-pages',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('scan.pdf')).toBeInTheDocument();
      expect(screen.getByText('画像変換')).toBeInTheDocument();
      // ハイフンが4つ表示される（ファイル内画像列・画像・図形抽出列・抽出文字数列・抽出画像数列）
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(4);
    });

    it('txtファイルの場合、ファイル内画像・画像・図形抽出・抽出画像数がハイフンで表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'readme.txt',
              processMode: 'text',
              formatType: 'txt-plain',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('readme.txt')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(3);
    });

    it('markdownファイルの場合、ファイル内画像・画像・図形抽出・抽出画像数がハイフンで表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'readme.md',
              processMode: 'text',
              formatType: 'md-plain',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('readme.md')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(3);
    });

    it('csvファイルの場合、ファイル内画像・画像・図形抽出・抽出画像数がハイフンで表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'data.csv',
              processMode: 'text',
              formatType: 'csv-plain',
              includeImages: false,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('data.csv')).toBeInTheDocument();
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(3);
    });
  });

  describe('複数ファイルの表示', () => {
    it('複数ファイルが正しく表示される', () => {
      const caches: DocumentCacheInfo[] = [
        createCache({
          fileName: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          includeImages: true,
        }),
        createCache({
          fileName: 'memo.docx',
          formatType: 'docx-plain',
          includeImages: false,
        }),
        createCache({
          fileName: 'scan.pdf',
          processMode: 'image',
          formatType: 'image-pages',
        }),
        createCache({
          fileName: 'readme.txt',
          formatType: 'txt-plain',
        }),
      ];

      render(<FileProcessingResultSection documentCaches={caches} />);

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('report.xlsx')).toBeInTheDocument();
      expect(screen.getByText('memo.docx')).toBeInTheDocument();
      expect(screen.getByText('scan.pdf')).toBeInTheDocument();
      expect(screen.getByText('readme.txt')).toBeInTheDocument();

      // リッチ成功
      expect(screen.getByText('成功')).toBeInTheDocument();
      // フォールバック
      expect(screen.getByText('失敗')).toBeInTheDocument();
    });
  });

  describe('多数ファイル表示のスクロール', () => {
    it('テーブルコンテナにmaxHeightが設定されていること', () => {
      const caches: DocumentCacheInfo[] = Array.from({ length: 20 }, (_, i) =>
        createCache({
          fileName: `file${i}.xlsx`,
          formatType: 'xlsx-rich-v1',
          includeImages: true,
        }),
      );

      const { container } = render(
        <FileProcessingResultSection documentCaches={caches} />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // TableContainerにmaxHeightが設定されている
      const tableContainer = container.querySelector('.MuiTableContainer-root');
      expect(tableContainer).toBeTruthy();
      expect(tableContainer).toHaveStyle({ maxHeight: '300px' });
    });
  });

  describe('抽出画像数の表示', () => {
    it('リッチ成功+includeImages=trueで画像5枚の場合「5」が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: true,
              extractedImageCount: 5,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('リッチ成功+includeImages=trueで画像0枚の場合「0」が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.docx',
              formatType: 'docx-rich-v1',
              includeImages: true,
              extractedImageCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('リッチ成功+includeImages=falseの場合ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: false,
              extractedImageCount: 5,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // ファイル内画像列のハイフンはないが、抽出画像数列のハイフンが表示される
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(1);
    });

    it('フォールバック（リッチ失敗）の場合ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-csv-v1',
              includeImages: false,
              extractedImageCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // ファイル内画像列と抽出画像数列の2つのハイフン
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(2);
    });

    it('画像変換モードの場合ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'scan.pdf',
              processMode: 'image',
              formatType: 'image-pages',
              includeImages: false,
              extractedImageCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // ファイル内画像列・画像図形抽出列・抽出文字数列・抽出画像数列の4つのハイフン
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(4);
    });

    it('プレーンオンリー形式の場合ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'readme.txt',
              processMode: 'text',
              formatType: 'txt-plain',
              includeImages: false,
              extractedImageCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // ファイル内画像列・画像図形抽出列・抽出画像数列の3つのハイフン
      const dashes = screen.getAllByText('-');
      expect(dashes).toHaveLength(3);
    });

    it('複数ファイルで各ファイルごとに正しい画像数が表示される', () => {
      const caches: DocumentCacheInfo[] = [
        createCache({
          fileName: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          includeImages: true,
          extractedImageCount: 5,
        }),
        createCache({
          fileName: 'document.docx',
          formatType: 'docx-rich-v1',
          includeImages: true,
          extractedImageCount: 2,
        }),
        createCache({
          fileName: 'scan.pdf',
          processMode: 'image',
          formatType: 'image-pages',
          includeImages: false,
          extractedImageCount: 0,
        }),
      ];

      render(<FileProcessingResultSection documentCaches={caches} />);

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('抽出文字数の表示', () => {
    it('テキストモードで文字数が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: true,
              textCharacterCount: 1500,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('1,500')).toBeInTheDocument();
    });

    it('テキストモードで文字数0の場合「0」が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'report.xlsx',
              formatType: 'xlsx-rich-v1',
              includeImages: true,
              textCharacterCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('画像変換モードの場合ハイフンが表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'scan.pdf',
              processMode: 'image',
              formatType: 'image-pages',
              includeImages: false,
              textCharacterCount: 0,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      // 画像変換モードでは抽出文字数列もハイフン
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('プレーンオンリー形式でも文字数が表示される', () => {
      render(
        <FileProcessingResultSection
          documentCaches={[
            createCache({
              fileName: 'readme.txt',
              processMode: 'text',
              formatType: 'txt-plain',
              includeImages: false,
              textCharacterCount: 500,
            }),
          ]}
        />,
      );

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('複数ファイルで各ファイルごとに正しい文字数が表示される', () => {
      const caches: DocumentCacheInfo[] = [
        createCache({
          fileName: 'report.xlsx',
          formatType: 'xlsx-rich-v1',
          includeImages: true,
          textCharacterCount: 1500,
        }),
        createCache({
          fileName: 'document.docx',
          formatType: 'docx-rich-v1',
          includeImages: true,
          textCharacterCount: 3000,
        }),
        createCache({
          fileName: 'scan.pdf',
          processMode: 'image',
          formatType: 'image-pages',
          includeImages: false,
          textCharacterCount: 0,
        }),
      ];

      render(<FileProcessingResultSection documentCaches={caches} />);

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(screen.getByText('1,500')).toBeInTheDocument();
      expect(screen.getByText('3,000')).toBeInTheDocument();
    });
  });

  describe('説明ボックス', () => {
    it('展開時に説明ボックスが表示される', () => {
      render(<FileProcessingResultSection documentCaches={[createCache()]} />);

      fireEvent.click(screen.getByText('ファイル処理結果'));

      expect(
        screen.getByText(
          '画像・図形処理についてはファイル形式ごとに処理方法が異なります',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Word・PDF：挿入された画像・図形情報（図形内テキスト）/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Excel・PowerPoint：挿入された画像・図形情報（図形内テキスト・種類・大きさ・座標）/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /挿入画像を含めないよう選択している場合は図形情報のみ利用/,
        ),
      ).toBeInTheDocument();
    });
  });
});
