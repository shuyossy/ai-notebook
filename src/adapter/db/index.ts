import {
  ISourceRepository,
  IReviewRepository,
  ISettingsRepository,
} from '@/main/service/port';
import {
  DrizzleReviewRepository,
  DrizzleSourceRepository,
  ElectronStoreSettingsRepository,
} from './drizzle/repository';

let sourceRepository: ISourceRepository | null = null;

let SettingsRepository: ISettingsRepository | null = null;

let reviewRepository: IReviewRepository | null = null;

export function getSourceRepository(): ISourceRepository {
  if (!sourceRepository) {
    sourceRepository = new DrizzleSourceRepository();
  }
  return sourceRepository;
}

export const getSettingsRepository = (): ISettingsRepository => {
  if (!SettingsRepository) {
    SettingsRepository = new ElectronStoreSettingsRepository();
  }
  return SettingsRepository;
};

/**
 * ドキュメントレビュー用のリポジトリを取得
 * @returns ReviewRepositoryのインスタンス
 */
export function getReviewRepository(): IReviewRepository {
  if (!reviewRepository) {
    reviewRepository = new DrizzleReviewRepository();
  }
  return reviewRepository;
}
