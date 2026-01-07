import { InformationItem } from '@/types';
import { invokeApi } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';

/**
 * お知らせAPIのインターフェース
 */
export interface IInformationApi {
  /**
   * お知らせ情報を取得する
   */
  getInformations(
    options?: ApiServiceDefaultOptions,
  ): Promise<InformationItem[] | null>;
}

/**
 * お知らせAPIの実装
 */
export class InformationApi implements IInformationApi {
  // シングルトン変数
  private static instance: InformationApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  /**
   * シングルトンインスタンスを取得するための静的メソッド
   */
  public static getInstance(): InformationApi {
    if (!InformationApi.instance) {
      InformationApi.instance = new InformationApi();
    }
    return InformationApi.instance;
  }

  /**
   * お知らせ情報を取得する
   */
  public async getInformations(
    options?: ApiServiceDefaultOptions,
  ): Promise<InformationItem[] | null> {
    return invokeApi(
      () => window.electron.information.getInformations(),
      options,
    );
  }
}
