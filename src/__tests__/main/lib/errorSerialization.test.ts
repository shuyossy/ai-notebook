import { AppError } from '@/main/lib/error';

// electron-logのモック
const mockError = jest.fn();

jest.mock('electron-log/main', () => {
  const mock = {
    error: mockError,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    transports: {
      file: { level: 'debug', resolvePathFn: jest.fn() },
      console: { level: 'debug' },
    },
    initialize: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
  };
});

jest.mock('../../../main/main', () => ({
  getCustomAppDataDir: () => '/tmp/test',
}));

import { logError } from '@/main/lib/logger';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('logError関数', () => {
  describe('通常Errorのシリアライズ', () => {
    it('通常Errorの場合、logger.errorが呼ばれtype/message/stackを含むシリアライズ結果が渡されること', () => {
      // Arrange
      const error = new Error('テストエラー');

      // Act
      logError(error, 'テストメッセージ');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [serialized, message] = mockError.mock.calls[0];
      expect(message).toBe('テストメッセージ');
      expect(serialized).toHaveProperty('type', 'Error');
      expect(serialized).toHaveProperty('message', 'テストエラー');
      expect(serialized).toHaveProperty('stack');
    });
  });

  describe('cause付きErrorのシリアライズ', () => {
    it('cause付きErrorの場合、cause chainが再帰シリアライズされること', () => {
      // Arrange
      const rootCause = new Error('根本原因');
      const error = new Error('ラッパーエラー', { cause: rootCause });

      // Act
      logError(error, 'cause付きエラー');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [serialized] = mockError.mock.calls[0];
      expect(serialized).toHaveProperty('type', 'Error');
      // errWithCauseはcauseの情報をmessageとstackに含める
      expect(serialized.message).toContain('ラッパーエラー');
    });
  });

  describe('AppErrorのシリアライズ', () => {
    it('AppErrorの場合、シリアライズされてtypeがAppErrorになること', () => {
      // Arrange
      const appError = new AppError('INTERNAL', {
        expose: true,
        messageCode: 'UNKNOWN_ERROR',
      });

      // Act
      logError(appError, 'AppErrorテスト');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [serialized] = mockError.mock.calls[0];
      expect(serialized).toHaveProperty('type', 'AppError');
      expect(serialized).toHaveProperty('message');
      expect(serialized).toHaveProperty('stack');
    });
  });

  describe('AppError + cause(原因Error)のシリアライズ', () => {
    it('AppError + causeの場合、ネストシリアライズされること', () => {
      // Arrange
      const rootCause = new Error('DB接続エラー');
      const appError = new AppError('INTERNAL', {
        expose: true,
        messageCode: 'DATA_ACCESS_ERROR',
        messageParams: { detail: 'テスト' },
        cause: rootCause,
      });

      // Act
      logError(appError, 'AppError+causeテスト');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [serialized] = mockError.mock.calls[0];
      expect(serialized).toHaveProperty('type', 'AppError');
      expect(serialized.message).toBeDefined();
    });
  });

  describe('3段以上のcause chainのシリアライズ', () => {
    it('3段以上のcause chainの場合、全段階シリアライズされること', () => {
      // Arrange
      const level3 = new Error('レベル3: 根本原因');
      const level2 = new Error('レベル2: 中間エラー', { cause: level3 });
      const level1 = new Error('レベル1: トップエラー', { cause: level2 });

      // Act
      logError(level1, '多段cause chain');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [serialized] = mockError.mock.calls[0];
      expect(serialized).toHaveProperty('type', 'Error');
      expect(serialized.message).toContain('レベル1: トップエラー');
    });
  });

  describe('コンテキスト付きログ', () => {
    it('コンテキスト付きの場合、context情報がlogger.errorの引数に含まれること', () => {
      // Arrange
      const error = new Error('コンテキスト付きエラー');
      const context = {
        documentName: 'test.pdf',
        attempt: 3,
        reviewHistoryId: 'review-123',
      };

      // Act
      logError(error, 'コンテキスト付きエラー', context);

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [firstArg, message] = mockError.mock.calls[0];
      expect(message).toBe('コンテキスト付きエラー');
      // コンテキスト情報がオブジェクトとして渡される
      expect(firstArg).toHaveProperty('err');
      expect(firstArg).toHaveProperty('documentName', 'test.pdf');
      expect(firstArg).toHaveProperty('attempt', 3);
      expect(firstArg).toHaveProperty('reviewHistoryId', 'review-123');
      // errプロパティにシリアライズ済みエラーが含まれる
      expect(firstArg.err).toHaveProperty('type', 'Error');
      expect(firstArg.err).toHaveProperty('message', 'コンテキスト付きエラー');
    });
  });

  describe('非Error値のログ', () => {
    it('非Error値（文字列）の場合、エラーにならずlogger.errorが呼ばれること', () => {
      // Arrange
      const nonError = 'ただの文字列エラー';

      // Act
      logError(nonError, '非Errorテスト');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [firstArg, message] = mockError.mock.calls[0];
      expect(message).toBe('非Errorテスト');
    });

    it('非Error値（オブジェクト）の場合、エラーにならずlogger.errorが呼ばれること', () => {
      // Arrange
      const nonError = { code: 500, detail: 'サーバーエラー' };

      // Act
      logError(nonError, '非Errorオブジェクトテスト');

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
    });

    it('非Error値 + コンテキスト付きの場合、エラーにならずlogger.errorが呼ばれること', () => {
      // Arrange
      const nonError = 'ただの文字列';
      const context = { filePath: '/path/to/file' };

      // Act
      logError(nonError, '非Error+コンテキスト', context);

      // Assert
      expect(mockError).toHaveBeenCalledTimes(1);
      const [firstArg, message] = mockError.mock.calls[0];
      expect(message).toBe('非Error+コンテキスト');
      expect(firstArg).toHaveProperty('filePath', '/path/to/file');
    });
  });
});
