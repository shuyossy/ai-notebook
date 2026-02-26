import {
  getWaitTimeMs,
  recordRequest,
  resetRateLimiter,
  notifyRateLimitHit,
  getGlobalPauseRemainingMs,
} from '@/mastra/lib/rateLimiter';
import { MODEL_RATE_LIMITS, DEFAULT_RATE_LIMIT } from '@/config/modelConfig';

describe('rateLimiter', () => {
  beforeEach(() => {
    resetRateLimiter();
    jest.restoreAllMocks();
  });

  describe('正常系', () => {
    it('初回リクエストは待機時間0を返す', () => {
      const waitTime = getWaitTimeMs('gpt-4o');
      expect(waitTime).toBe(0);
    });

    it('上限到達時に正の待機時間を返す', () => {
      const modelName = 'gpt-4o';
      const limit = MODEL_RATE_LIMITS[modelName];
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // 上限までリクエストを記録
      for (let i = 0; i < limit; i++) {
        recordRequest(modelName);
      }

      // 次のリクエストは待機が必要（全リクエストが同一時刻に記録 → oldest + 60_000 - now = 60_000）
      const waitTime = getWaitTimeMs(modelName);
      expect(waitTime).toBe(60_000);
    });

    it('ウィンドウ外のリクエストは除外される', () => {
      const modelName = 'gpt-4o';
      const limit = MODEL_RATE_LIMITS[modelName];
      // 61秒前のタイムスタンプ
      const pastTime = Date.now() - 61_000;

      jest.spyOn(Date, 'now').mockReturnValue(pastTime);
      // 上限までリクエストを記録（61秒前）
      for (let i = 0; i < limit; i++) {
        recordRequest(modelName);
      }

      // 現在時刻に戻す
      jest.spyOn(Date, 'now').mockReturnValue(pastTime + 61_000);

      // ウィンドウ外なので待機不要
      const waitTime = getWaitTimeMs(modelName);
      expect(waitTime).toBe(0);
    });

    it('既知モデルは設定されたレート制限を使用する', () => {
      const modelName = 'gpt-5';
      const limit = MODEL_RATE_LIMITS[modelName]; // 10
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // 上限-1までリクエストを記録
      for (let i = 0; i < limit - 1; i++) {
        recordRequest(modelName);
      }

      // まだ余裕がある
      expect(getWaitTimeMs(modelName)).toBe(0);

      // 上限に到達
      recordRequest(modelName);
      expect(getWaitTimeMs(modelName)).toBe(60_000);
    });

    it('未知モデルはDEFAULT_RATE_LIMITを使用する', () => {
      const modelName = 'unknown-model';
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // DEFAULT_RATE_LIMITまでリクエストを記録
      for (let i = 0; i < DEFAULT_RATE_LIMIT; i++) {
        recordRequest(modelName);
      }

      // 上限に到達
      expect(getWaitTimeMs(modelName)).toBe(60_000);
    });

    it('resetRateLimiterで状態がクリアされる', () => {
      const modelName = 'gpt-4o';
      const limit = MODEL_RATE_LIMITS[modelName];
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // 上限までリクエストを記録
      for (let i = 0; i < limit; i++) {
        recordRequest(modelName);
      }
      expect(getWaitTimeMs(modelName)).toBe(60_000);

      // リセット
      resetRateLimiter();

      // リセット後は待機不要
      expect(getWaitTimeMs(modelName)).toBe(0);
    });
  });

  describe('グローバル一時停止', () => {
    it('notifyRateLimitHitで一時停止が設定される', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      notifyRateLimitHit(5000);

      const remaining = getGlobalPauseRemainingMs();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    it('期限後は残り時間0を返す', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      notifyRateLimitHit(3000);

      // 3秒後に進める
      jest.spyOn(Date, 'now').mockReturnValue(now + 3001);

      expect(getGlobalPauseRemainingMs()).toBe(0);
    });

    it('より長い一時停止で上書きされる', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      notifyRateLimitHit(3000);
      notifyRateLimitHit(10000);

      const remaining = getGlobalPauseRemainingMs();
      expect(remaining).toBeGreaterThan(3000);
      expect(remaining).toBeLessThanOrEqual(10000);
    });

    it('より短い一時停止では上書きされない', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      notifyRateLimitHit(10000);
      notifyRateLimitHit(3000);

      const remaining = getGlobalPauseRemainingMs();
      expect(remaining).toBeGreaterThan(3000);
      expect(remaining).toBeLessThanOrEqual(10000);
    });

    it('未通知時は残り時間0を返す', () => {
      expect(getGlobalPauseRemainingMs()).toBe(0);
    });

    it('resetRateLimiterでグローバル一時停止もクリアされる', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      notifyRateLimitHit(10000);
      expect(getGlobalPauseRemainingMs()).toBeGreaterThan(0);

      resetRateLimiter();

      expect(getGlobalPauseRemainingMs()).toBe(0);
    });
  });
});
