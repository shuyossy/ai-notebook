import { Source } from '../types';

// ソース情報の管理サービス
export const sourceService = {
  /**
   * ソース一覧を取得する
   * @returns ソース情報の配列
   */
  getSources: async (): Promise<Source[]> => {
    // 実際にはIPC通信を使用してメインプロセスから取得する
    // ここではモックデータを返す
    return [
      {
        id: 1,
        title: 'AIの基礎知識',
        summary:
          '人工知能の基本的な概念と歴史、現在の技術動向について解説したドキュメント',
        topics: [
          { name: '機械学習', summary: '機械学習の基本的な概念と手法' },
          {
            name: 'ディープラーニング',
            summary: 'ニューラルネットワークと深層学習の仕組み',
          },
          { name: '自然言語処理', summary: 'テキスト処理と言語理解の技術' },
        ],
      },
      {
        id: 2,
        title: 'プログラミング入門',
        summary: 'プログラミングの基本概念と主要な言語の特徴を解説したガイド',
        topics: [
          { name: 'JavaScript', summary: 'Webフロントエンド開発のための言語' },
          { name: 'Python', summary: 'データ分析やAI開発によく使われる言語' },
          { name: 'TypeScript', summary: '型安全なJavaScriptの拡張言語' },
        ],
      },
    ];
  },

  /**
   * ソースの再読み込みを実行する
   * @returns 実行結果
   */
  reloadSources: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      // 実際にはIPC通信を使用してメインプロセスに再読み込みを要求する
      // ここではモックとして成功レスポンスを返す
      return { success: true, message: 'ソースの再読み込みが完了しました' };
    } catch (error) {
      return {
        success: false,
        message: `ソースの再読み込みに失敗しました: ${(error as Error).message}`,
      };
    }
  },
};

export default sourceService;
