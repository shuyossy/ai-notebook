import {
  getMimeTypeFromExtension,
  arrayBufferToBase64,
  fileToDataURL,
} from '@/renderer/lib/fileUtils';

describe('fileUtils', () => {
  describe('getMimeTypeFromExtension', () => {
    describe('画像タイプ', () => {
      it('png拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('png')).toBe('image/png');
      });

      it('jpg拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('jpg')).toBe('image/jpeg');
      });

      it('jpeg拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('jpeg')).toBe('image/jpeg');
      });

      it('gif拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('gif')).toBe('image/gif');
      });

      it('webp拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('webp')).toBe('image/webp');
      });
    });

    describe('ドキュメントタイプ', () => {
      it('pdf拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('pdf')).toBe('application/pdf');
      });

      it('doc拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('doc')).toBe('application/msword');
      });

      it('docx拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('docx')).toBe(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
      });

      it('xls拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('xls')).toBe(
          'application/vnd.ms-excel',
        );
      });

      it('xlsx拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('xlsx')).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      });

      it('ppt拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('ppt')).toBe(
          'application/vnd.ms-powerpoint',
        );
      });

      it('pptx拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('pptx')).toBe(
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        );
      });

      it('txt拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('txt')).toBe('text/plain');
      });

      it('csv拡張子に対して正しいMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('csv')).toBe('text/csv');
      });
    });

    describe('未知の拡張子', () => {
      it('未知の拡張子に対してデフォルトのMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('xyz')).toBe(
          'application/octet-stream',
        );
      });

      it('空文字列に対してデフォルトのMIMEタイプを返すこと', () => {
        expect(getMimeTypeFromExtension('')).toBe('application/octet-stream');
      });
    });
  });

  describe('arrayBufferToBase64', () => {
    it('空のUint8Arrayに対して空文字列を返すこと', () => {
      const buffer = new Uint8Array([]);
      expect(arrayBufferToBase64(buffer)).toBe('');
    });

    it('ASCIIバイナリデータを正しくbase64変換すること', () => {
      // "Hello" のバイト列
      const buffer = new Uint8Array([72, 101, 108, 108, 111]);
      expect(arrayBufferToBase64(buffer)).toBe(btoa('Hello'));
    });

    it('バイナリデータを正しくbase64変換すること', () => {
      // 任意のバイナリデータ
      const buffer = new Uint8Array([0, 127, 255]);
      const result = arrayBufferToBase64(buffer);
      // 結果が有効なbase64文字列であることを確認
      expect(() => atob(result)).not.toThrow();
    });
  });

  describe('fileToDataURL', () => {
    it('テキストファイルをData URLに変換すること', async () => {
      const content = 'テスト内容';
      const file = new File([content], 'test.txt', { type: 'text/plain' });

      const result = await fileToDataURL(file);

      expect(result).toMatch(/^data:text\/plain;base64,/);
    });

    it('画像ファイルをData URLに変換すること', async () => {
      // 1x1の透明なPNG画像（最小限のPNGデータ）
      const pngData = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const file = new File([pngData], 'test.png', { type: 'image/png' });

      const result = await fileToDataURL(file);

      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('日本語を含むテキストファイルを正しく処理すること', async () => {
      const content = 'こんにちは世界';
      const file = new File([content], 'japanese.txt', { type: 'text/plain' });

      const result = await fileToDataURL(file);

      // Data URLから内容をデコードして元の内容と比較
      const base64 = result.split(',')[1];
      const decoded = atob(base64);
      // UTF-8としてデコード
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      const decodedContent = new TextDecoder('utf-8').decode(bytes);

      expect(decodedContent).toBe(content);
    });
  });
});
