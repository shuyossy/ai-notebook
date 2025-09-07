import { getSourceRepository } from '../repository/sourceRepository';
import { Source } from '@/db/schema';

export interface ISourceService {
  getAllSources(): Promise<Source[]>;
  updateSourceEnabled(sourceId: number, enabled: boolean): Promise<void>;
}

export class SourceService implements ISourceService {
  // シングルトン変数
  private static instance: SourceService;

  // ドキュメント関連リポジトリ
  private sourceRepository = getSourceRepository();

  // シングルトンインスタンスを取得
  public static getInstance(): SourceService {
    if (!SourceService.instance) {
      SourceService.instance = new SourceService();
    }
    return SourceService.instance;
  }

  /**
   * 全てのソースを取得する
   */
  public async getAllSources(): Promise<Source[]> {
    const allSources = await this.sourceRepository.getAllSources();
    return allSources;
  }

  /**
   * ソースの有効/無効を更新する
   * @param sourceId ソースID
   * @param enabled 有効/無効
   */
  public async updateSourceEnabled(
    sourceId: number,
    enabled: boolean,
  ): Promise<void> {
    await this.sourceRepository.updateSourceEnabled(sourceId, enabled);
  }
}
