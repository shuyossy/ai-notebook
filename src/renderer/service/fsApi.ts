import { OpenDialogOptions } from 'electron';
import { invokeApi } from '../lib/apiUtils';
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
  convertOfficeToPdf(
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
    return invokeApi(
      () => window.electron.fs.showOpenDialog(options),
      apiOptions,
    );
  }

  public async readFile(
    filePath: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<Uint8Array | null> {
    return invokeApi(() => window.electron.fs.readFile(filePath), apiOptions);
  }

  public async convertOfficeToPdf(
    filePath: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<Uint8Array | null> {
    return invokeApi(
      () => window.electron.fs.convertOfficeToPdf(filePath),
      apiOptions,
    );
  }

  public async access(
    path: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<boolean | null> {
    return invokeApi(() => window.electron.fs.access(path), apiOptions);
  }
}
