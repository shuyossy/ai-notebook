// ソース情報の管理サービス
export const sourceService = {
  /**
   * ソースの再読み込みを実行する
   * @returns 実行結果
   */
  reloadSources: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      // IPC通信を使用してメインプロセスに再読み込みを要求する
      const result = await window.electron.source.reloadSources();
      return result;
      // eslint-disable-next-line
    } catch (error) {
      return {
        success: false,
        message: `ソースの再読み込みに失敗しました: ${(error as Error).message}`,
      };
    }
  },
  /**
   * ソースの登録ディレクトリを取得する
   * @returns 登録ディレクトリのパス
   */
  getRegisterDir: async (): Promise<{
    success: boolean;
    dir?: string;
    error?: string;
  }> => {
    try {
      // IPC通信を使用してメインプロセスから登録ディレクトリを取得する
      const source = (await window.electron.store.get('source')) as any;
      if (!source || !source.registerDir) {
        return {
          success: false,
          error: 'ドキュメント登録ディレクトリが設定されていません',
        };
      }
      return { success: true, dir: source.registerDir || '' };
      // eslint-disable-next-line
    } catch (error) {
      return {
        success: false,
        error: `ドキュメント登録ディレクトリの取得に失敗しました`,
      };
    }
  },
};

export default sourceService;
