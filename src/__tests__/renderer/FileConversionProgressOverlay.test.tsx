/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import FileConversionProgressOverlay from '@/renderer/components/common/FileConversionProgressOverlay';
import type { ConversionProgress } from '@/types';

describe('FileConversionProgressOverlay Component', () => {
  // ========================================
  // 正常系テスト
  // ========================================

  describe('正常系', () => {
    describe('オーバーレイの表示/非表示', () => {
      it('open=trueの場合、オーバーレイが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'test-document.pdf',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 3,
        };

        const { container } = render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        // CircularProgressが表示されている
        const circularProgress = container.querySelector('.MuiCircularProgress-root');
        expect(circularProgress).toBeInTheDocument();
        expect(screen.getByText('ファイルを変換しています')).toBeInTheDocument();
      });

      it('open=falseの場合、オーバーレイが非表示になること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'test-document.pdf',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 3,
        };

        const { container } = render(
          <FileConversionProgressOverlay open={false} progress={progress} />,
        );

        // Backdropは非表示だが、DOMには存在する
        const backdrop = container.querySelector('.MuiBackdrop-root');
        expect(backdrop).toBeInTheDocument();
        // visibility: hidden がスタイルに設定されている
        expect(backdrop).toHaveStyle({ visibility: 'hidden' });
      });
    });

    describe('カスタムタイトル', () => {
      it('カスタムタイトルが指定された場合、そのタイトルが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'test.xlsx',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 2,
        };

        render(
          <FileConversionProgressOverlay
            open={true}
            progress={progress}
            title="カスタムタイトル"
          />,
        );

        expect(screen.getByText('カスタムタイトル')).toBeInTheDocument();
      });

      it('タイトルが指定されない場合、デフォルトタイトルが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'test.pdf',
          conversionType: 'image',
          currentIndex: 1,
          totalCount: 1,
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText('ファイルを変換しています')).toBeInTheDocument();
      });
    });

    describe('PDF変換時の進捗表示', () => {
      it('PDF変換中の基本的なメッセージが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'document.docx',
          conversionType: 'pdf',
          currentIndex: 2,
          totalCount: 5,
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText('document.docx')).toBeInTheDocument();
        expect(screen.getByText(/PDFに変換中\.\.\./)).toBeInTheDocument();
        expect(screen.getByText(/処理済み: 2 \/ 5 ファイル/)).toBeInTheDocument();
      });

      it('シート設定中の詳細情報が表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'spreadsheet.xlsx',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 3,
          progressDetail: {
            type: 'sheet-setup',
            sheetName: 'シート1',
            currentSheet: 2,
            totalSheets: 5,
          },
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText('spreadsheet.xlsx')).toBeInTheDocument();
        expect(screen.getByText(/「シート1」/)).toBeInTheDocument();
        expect(screen.getByText(/シートPDF印刷設定中/)).toBeInTheDocument();
        expect(screen.getByText(/\(2\/5\)/)).toBeInTheDocument();
      });

      it('シート設定中でシート番号がない場合も正しく表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'spreadsheet.xlsx',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 1,
          progressDetail: {
            type: 'sheet-setup',
            sheetName: 'データシート',
          },
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText(/「データシート」/)).toBeInTheDocument();
        expect(screen.getByText(/シートPDF印刷設定中/)).toBeInTheDocument();
        // シート番号は表示されない
        expect(screen.queryByText(/\(\d+\/\d+\)/)).not.toBeInTheDocument();
      });

      it('PDFエクスポート中のメッセージが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'presentation.pptx',
          conversionType: 'pdf',
          currentIndex: 3,
          totalCount: 4,
          progressDetail: {
            type: 'pdf-export',
          },
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText('presentation.pptx')).toBeInTheDocument();
        expect(screen.getByText(/PDFファイルへエクスポート中/)).toBeInTheDocument();
      });

      it('キャッシュに関する注意事項が表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'document.doc',
          conversionType: 'pdf',
          currentIndex: 1,
          totalCount: 1,
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(
          screen.getByText(/変換に時間がかかる場合があります/),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/変換されたPDFファイルはファイルパス、最終更新時刻をキーにキャッシュされます/),
        ).toBeInTheDocument();
      });
    });

    describe('画像変換時の進捗表示', () => {
      it('画像変換中のメッセージが表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'document.pdf',
          conversionType: 'image',
          currentIndex: 1,
          totalCount: 2,
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText('document.pdf')).toBeInTheDocument();
        expect(screen.getByText('画像に変換中...')).toBeInTheDocument();
        expect(screen.getByText(/処理済み: 1 \/ 2 ファイル/)).toBeInTheDocument();
      });
    });

    describe('処理済みファイル数表示', () => {
      it('処理済みファイル数が正しく表示されること', () => {
        const progress: ConversionProgress = {
          currentFileName: 'file.pdf',
          conversionType: 'image',
          currentIndex: 5,
          totalCount: 10,
        };

        render(
          <FileConversionProgressOverlay open={true} progress={progress} />,
        );

        expect(screen.getByText(/処理済み: 5 \/ 10 ファイル/)).toBeInTheDocument();
      });
    });
  });

  // ========================================
  // 異常系テスト
  // ========================================

  describe('異常系', () => {
    it('progress=nullでも安全にレンダリングされること', () => {
      render(<FileConversionProgressOverlay open={true} progress={null} />);

      // タイトルは表示される
      expect(screen.getByText('ファイルを変換しています')).toBeInTheDocument();
      // 進捗詳細は表示されない
      expect(screen.queryByText(/処理済み/)).not.toBeInTheDocument();
    });

    it('progress=undefinedでも安全にレンダリングされること', () => {
      render(
        <FileConversionProgressOverlay
          open={true}
          progress={undefined as unknown as ConversionProgress | null}
        />,
      );

      expect(screen.getByText('ファイルを変換しています')).toBeInTheDocument();
    });

    it('progressDetailがundefinedの場合も正しく表示されること', () => {
      const progress: ConversionProgress = {
        currentFileName: 'test.pdf',
        conversionType: 'pdf',
        currentIndex: 1,
        totalCount: 1,
        progressDetail: undefined,
      };

      render(
        <FileConversionProgressOverlay open={true} progress={progress} />,
      );

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText(/PDFに変換中\.\.\./)).toBeInTheDocument();
    });
  });
});
