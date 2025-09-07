import { OpenDialogOptions } from 'electron';
import { getData } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';

export interface IFsApi {
  showOpenDialog(
    options: OpenDialogOptions,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<{ filePaths: string[]; canceled: boolean } | null>;
  readFile(
    filePath: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<Uint8Array | null>;
  access(
    path: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<boolean | null>;
}

export class FsApi implements IFsApi {
  // シングルトン変数
  private static instance: FsApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): FsApi {
    if (!FsApi.instance) {
      FsApi.instance = new FsApi();
    }
    return FsApi.instance;
  }

  public async showOpenDialog(
    options: OpenDialogOptions,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<{ filePaths: string[]; canceled: boolean } | null> {
    const result = await window.electron.fs.showOpenDialog(options);
    return getData(result, apiOptions);
  }

  public async readFile(
    filePath: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<Uint8Array | null> {
    const result = await window.electron.fs.readFile(filePath);
    return getData(result, apiOptions);
  }

  public async access(
    path: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<boolean | null> {
    const result = await window.electron.fs.access(path);
    return getData(result, apiOptions);
  }
}
