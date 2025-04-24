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
};

export default sourceService;
