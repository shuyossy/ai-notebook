/**
 * mimeUtils のテスト
 * @jest-environment node
 */

import {
  MIME_TO_EXT,
  EXT_TO_MIME,
  getExtFromMime,
  getMimeFromExt,
  AI_COMPATIBLE_MIME_TYPES,
  isAiCompatibleMime,
} from '@/main/lib/textExtractor/mimeUtils';

describe('mimeUtils', () => {
  describe('MIME_TO_EXT', () => {
    describe('正常系', () => {
      it.each([
        ['image/png', 'png'],
        ['image/jpeg', 'jpg'],
        ['image/gif', 'gif'],
        ['image/bmp', 'bmp'],
        ['image/tiff', 'tiff'],
        ['image/svg+xml', 'svg'],
        ['image/webp', 'webp'],
        ['image/x-emf', 'emf'],
        ['image/x-wmf', 'wmf'],
      ])(
        'MIMEタイプ "%s" が拡張子 "%s" にマッピングされていること',
        (mime, ext) => {
          expect(MIME_TO_EXT[mime]).toBe(ext);
        },
      );

      it('定義されたマッピングが9件であること', () => {
        expect(Object.keys(MIME_TO_EXT)).toHaveLength(9);
      });
    });
  });

  describe('EXT_TO_MIME', () => {
    describe('正常系', () => {
      it.each([
        ['png', 'image/png'],
        ['jpg', 'image/jpeg'],
        ['gif', 'image/gif'],
        ['bmp', 'image/bmp'],
        ['tiff', 'image/tiff'],
        ['svg', 'image/svg+xml'],
        ['webp', 'image/webp'],
        ['emf', 'image/x-emf'],
        ['wmf', 'image/x-wmf'],
      ])(
        '拡張子 "%s" がMIMEタイプ "%s" に逆引きマッピングされていること',
        (ext, mime) => {
          expect(EXT_TO_MIME[ext]).toBe(mime);
        },
      );

      it('エイリアス "jpeg" が "image/jpeg" にマッピングされていること', () => {
        expect(EXT_TO_MIME['jpeg']).toBe('image/jpeg');
      });

      it('エイリアス "tif" が "image/tiff" にマッピングされていること', () => {
        expect(EXT_TO_MIME['tif']).toBe('image/tiff');
      });

      it('逆引き9件 + エイリアス2件 = 合計11件であること', () => {
        expect(Object.keys(EXT_TO_MIME)).toHaveLength(11);
      });
    });
  });

  describe('getExtFromMime', () => {
    describe('正常系', () => {
      it.each([
        ['image/png', 'png'],
        ['image/jpeg', 'jpg'],
        ['image/gif', 'gif'],
        ['image/bmp', 'bmp'],
        ['image/tiff', 'tiff'],
        ['image/svg+xml', 'svg'],
        ['image/webp', 'webp'],
        ['image/x-emf', 'emf'],
        ['image/x-wmf', 'wmf'],
      ])(
        '既知のMIMEタイプ "%s" から拡張子 "%s" が取得できること',
        (mime, expectedExt) => {
          expect(getExtFromMime(mime)).toBe(expectedExt);
        },
      );

      it('未知のMIMEタイプの場合、デフォルトの "png" が返ること', () => {
        expect(getExtFromMime('image/unknown')).toBe('png');
      });

      it('未知のMIMEタイプの場合、カスタムデフォルト値が返ること', () => {
        expect(getExtFromMime('image/unknown', 'jpg')).toBe('jpg');
      });
    });

    describe('異常系', () => {
      it('空文字列のMIMEタイプの場合、デフォルトの "png" が返ること', () => {
        expect(getExtFromMime('')).toBe('png');
      });

      it('MIMEタイプ形式でない文字列の場合、デフォルトの "png" が返ること', () => {
        expect(getExtFromMime('not-a-mime-type')).toBe('png');
      });
    });
  });

  describe('getMimeFromExt', () => {
    describe('正常系', () => {
      it.each([
        ['png', 'image/png'],
        ['jpg', 'image/jpeg'],
        ['gif', 'image/gif'],
        ['bmp', 'image/bmp'],
        ['tiff', 'image/tiff'],
        ['svg', 'image/svg+xml'],
        ['webp', 'image/webp'],
        ['emf', 'image/x-emf'],
        ['wmf', 'image/x-wmf'],
      ])(
        '既知の拡張子 "%s" からMIMEタイプ "%s" が取得できること',
        (ext, expectedMime) => {
          expect(getMimeFromExt(ext)).toBe(expectedMime);
        },
      );

      it('エイリアス "jpeg" から "image/jpeg" が取得できること', () => {
        expect(getMimeFromExt('jpeg')).toBe('image/jpeg');
      });

      it('エイリアス "tif" から "image/tiff" が取得できること', () => {
        expect(getMimeFromExt('tif')).toBe('image/tiff');
      });

      it('大文字の拡張子でもMIMEタイプが取得できること（大文字小文字を区別しない）', () => {
        expect(getMimeFromExt('PNG')).toBe('image/png');
      });

      it('大文字小文字混在の拡張子でもMIMEタイプが取得できること', () => {
        expect(getMimeFromExt('JpEg')).toBe('image/jpeg');
      });

      it('未知の拡張子の場合、デフォルトの "image/png" が返ること', () => {
        expect(getMimeFromExt('xyz')).toBe('image/png');
      });

      it('未知の拡張子の場合、カスタムデフォルト値が返ること', () => {
        expect(getMimeFromExt('xyz', 'image/jpeg')).toBe('image/jpeg');
      });
    });

    describe('異常系', () => {
      it('空文字列の拡張子の場合、デフォルトの "image/png" が返ること', () => {
        expect(getMimeFromExt('')).toBe('image/png');
      });

      it('存在しない拡張子の場合、デフォルトの "image/png" が返ること', () => {
        expect(getMimeFromExt('nonexistent')).toBe('image/png');
      });
    });
  });

  describe('AI_COMPATIBLE_MIME_TYPES', () => {
    it('許可リストが2件であること', () => {
      expect(AI_COMPATIBLE_MIME_TYPES.size).toBe(2);
    });

    it('image/pngが含まれること', () => {
      expect(AI_COMPATIBLE_MIME_TYPES.has('image/png')).toBe(true);
    });

    it('image/jpegが含まれること', () => {
      expect(AI_COMPATIBLE_MIME_TYPES.has('image/jpeg')).toBe(true);
    });
  });

  describe('isAiCompatibleMime', () => {
    describe('正常系', () => {
      it.each([
        ['image/png', true],
        ['image/jpeg', true],
      ])('AI互換MIMEタイプ "%s" の場合 %s が返ること', (mime, expected) => {
        expect(isAiCompatibleMime(mime)).toBe(expected);
      });
    });

    describe('異常系', () => {
      it.each([
        ['image/x-emf'],
        ['image/x-wmf'],
        ['image/gif'],
        ['image/webp'],
        ['image/bmp'],
        ['image/tiff'],
        ['image/svg+xml'],
      ])('AI非互換MIMEタイプ "%s" の場合 false が返ること', (mime) => {
        expect(isAiCompatibleMime(mime)).toBe(false);
      });

      it('空文字列の場合 false が返ること', () => {
        expect(isAiCompatibleMime('')).toBe(false);
      });

      it('未知のMIMEタイプの場合 false が返ること', () => {
        expect(isAiCompatibleMime('image/unknown')).toBe(false);
      });

      it('MIMEタイプ形式でない文字列の場合 false が返ること', () => {
        expect(isAiCompatibleMime('not-a-mime-type')).toBe(false);
      });
    });
  });
});
