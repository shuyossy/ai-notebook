/**
 * リポジトリ層で発生したエラーを表す共通クラス
 */
export class RepositoryError extends Error {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'RepositoryError';
    this.originalError = originalError;
    // スタックトレースを保持
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}
