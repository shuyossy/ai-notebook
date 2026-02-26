// loggerのモック（Electron依存回避のため、importより先に定義）
jest.mock('@/main/lib/logger', () => ({
  getMainLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  logError: jest.fn(),
}));

// rateLimiterモジュールをモック
jest.mock('@/mastra/lib/rateLimiter', () => ({
  getWaitTimeMs: jest.fn().mockReturnValue(0),
  recordRequest: jest.fn(),
  resetRateLimiter: jest.fn(),
  notifyRateLimitHit: jest.fn(),
  getGlobalPauseRemainingMs: jest.fn().mockReturnValue(0),
}));

// settingsRepositoryから返るモデル名を制御するためのモック
jest.mock('@/adapter/db', () => ({
  getSettingsRepository: jest.fn().mockReturnValue({
    getSettings: jest.fn().mockResolvedValue({
      api: { model: 'gpt-4o', key: 'test-key', url: 'test-url' },
    }),
  }),
}));

import { withAIControl } from '@/mastra/lib/withAIControl';
import * as rateLimiterModule from '@/mastra/lib/rateLimiter';
import * as agentUtils from '@/mastra/lib/agentUtils';

// withAIControl内部の定数と同じ値を定義
const MAX_RATE_LIMIT_RETRIES = 10;
const MAX_BACKOFF_MS = 60_000;

const mockGetWaitTimeMs = rateLimiterModule.getWaitTimeMs as jest.Mock;
const mockRecordRequest = rateLimiterModule.recordRequest as jest.Mock;
const mockNotifyRateLimitHit =
  rateLimiterModule.notifyRateLimitHit as jest.Mock;
const mockGetGlobalPauseRemainingMs =
  rateLimiterModule.getGlobalPauseRemainingMs as jest.Mock;

describe('withAIControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockGetWaitTimeMs.mockReturnValue(0);
    mockGetGlobalPauseRemainingMs.mockReturnValue(0);
  });

  describe('正常系', () => {
    it('初回成功時にコールバック結果がそのまま返される', async () => {
      const expected = { object: { foo: 'bar' }, finishReason: 'stop' };
      const generateFn = jest.fn().mockResolvedValue(expected);

      const result = await withAIControl(generateFn);

      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('レート制限待機が必要な場合、待機後に実行される', async () => {
      jest.useFakeTimers();
      // 最初の呼び出しでは500ms待機が必要、2回目は0
      mockGetWaitTimeMs.mockReturnValueOnce(500).mockReturnValue(0);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest.fn().mockResolvedValue(expected);

      const promise = withAIControl(generateFn);

      // sleepのタイマーを進める
      await jest.advanceTimersByTimeAsync(500);

      const result = await promise;
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('リクエスト記録（recordRequest）が呼ばれる', async () => {
      const generateFn = jest.fn().mockResolvedValue({ object: {} });

      await withAIControl(generateFn);

      expect(mockRecordRequest).toHaveBeenCalledWith('gpt-4o');
    });
  });

  describe('レート制限エラーリトライ', () => {
    it('レート制限エラー → バックオフ後にリトライし成功', async () => {
      jest.useFakeTimers();
      const rateLimitError = new Error('rate limit exceeded');

      // judgeErrorIsRateLimitErrorがtrueを返すようにする
      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValueOnce(true)
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue(expected);

      const promise = withAIControl(generateFn);

      // バックオフのタイマーを進める
      await jest.advanceTimersByTimeAsync(60_000);

      const result = await promise;
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(2);
      // エラー検知関数に正しいエラーオブジェクトが渡されることを検証
      expect(agentUtils.judgeErrorIsRateLimitError).toHaveBeenCalledWith(
        rateLimitError,
      );
    });

    it('最大10回リトライ後にエラーをthrow', async () => {
      jest.useFakeTimers();
      const rateLimitError = new Error('rate limit exceeded');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(true);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const generateFn = jest.fn().mockRejectedValue(rateLimitError);

      // タイマー進行中の未処理rejection回避のため、先にcatchハンドラを設定
      const caughtError = withAIControl(generateFn).catch((e) => e);

      // 全リトライ分のバックオフタイマーを進める
      for (let i = 0; i < MAX_RATE_LIMIT_RETRIES; i++) {
        await jest.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
      }

      const error = await caughtError;
      expect(error).toBe(rateLimitError);
      // 初回 + 10リトライ = 11回
      expect(generateFn).toHaveBeenCalledTimes(11);
    });

    it('リトライ回数に応じてバックオフ値が指数的に増加する', async () => {
      jest.useFakeTimers();
      const rateLimitError = new Error('rate limit exceeded');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(true);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);
      // Math.randomを0に固定 → Equal Jitter: half + 0 = half
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const generateFn = jest.fn().mockRejectedValue(rateLimitError);

      const caughtError = withAIControl(generateFn).catch((e) => e);

      // 全リトライ分のバックオフタイマーを進める
      for (let i = 0; i < MAX_RATE_LIMIT_RETRIES; i++) {
        await jest.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
      }

      const error = await caughtError;
      expect(error).toBe(rateLimitError);

      // notifyRateLimitHitの各呼び出し値が単調増加することを検証
      const calls = mockNotifyRateLimitHit.mock.calls.map(
        (c: [number]) => c[0],
      );
      expect(calls).toHaveLength(MAX_RATE_LIMIT_RETRIES);
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
      }
      // 最初のバックオフ値を確認 (retryCount=1: capped=1000, half=500)
      expect(calls[0]).toBe(500);
    });

    it('最大リトライ超過時にnotifyRateLimitHitは再度呼ばれない', async () => {
      jest.useFakeTimers();
      const rateLimitError = new Error('rate limit exceeded');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(true);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const generateFn = jest.fn().mockRejectedValue(rateLimitError);

      const caughtError = withAIControl(generateFn).catch((e) => e);

      for (let i = 0; i < MAX_RATE_LIMIT_RETRIES; i++) {
        await jest.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
      }

      const error = await caughtError;
      expect(error).toBe(rateLimitError);

      // notifyRateLimitHitは10回のみ（11回目のthrow時には呼ばれない）
      expect(mockNotifyRateLimitHit).toHaveBeenCalledTimes(
        MAX_RATE_LIMIT_RETRIES,
      );
      // generateFnは11回呼ばれる（初回 + 10リトライ）
      expect(generateFn).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    });
  });

  describe('パースエラーリトライ', () => {
    it('パースエラー → リトライし成功', async () => {
      const parseError = new Error('parse error');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValueOnce(true)
        .mockReturnValue(false);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest
        .fn()
        .mockRejectedValueOnce(parseError)
        .mockResolvedValue(expected);

      const result = await withAIControl(generateFn);
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(2);
      // エラー検知関数に正しいエラーオブジェクトが渡されることを検証
      expect(agentUtils.judgeNoObjectGeneratedError).toHaveBeenCalledWith(
        parseError,
      );
    });

    it('最大3回リトライ後にエラーをthrow', async () => {
      const parseError = new Error('parse error');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(true);

      const generateFn = jest.fn().mockRejectedValue(parseError);

      await expect(withAIControl(generateFn)).rejects.toThrow(parseError);
      // 初回 + 3リトライ = 4回
      expect(generateFn).toHaveBeenCalledTimes(4);
    });

    it('パースエラー時にnotifyRateLimitHitが呼ばれない', async () => {
      const parseError = new Error('parse error');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValueOnce(true)
        .mockReturnValue(false);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest
        .fn()
        .mockRejectedValueOnce(parseError)
        .mockResolvedValue(expected);

      await withAIControl(generateFn);

      expect(mockNotifyRateLimitHit).not.toHaveBeenCalled();
    });
  });

  describe('グローバル一時停止', () => {
    it('グローバル一時停止中は待機後に実行される', async () => {
      jest.useFakeTimers();
      // 最初のチェックでは1000ms待機、以降は0
      mockGetGlobalPauseRemainingMs
        .mockReturnValueOnce(1000)
        .mockReturnValue(0);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest.fn().mockResolvedValue(expected);

      const promise = withAIControl(generateFn);

      // グローバル一時停止のタイマーを進める
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('レート制限エラー時にnotifyRateLimitHitが呼ばれる', async () => {
      jest.useFakeTimers();
      const rateLimitError = new Error('rate limit exceeded');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValueOnce(true)
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);
      // バックオフ時間を固定するためMath.randomを固定
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue(expected);

      const promise = withAIControl(generateFn);

      // バックオフのタイマーを進める
      await jest.advanceTimersByTimeAsync(MAX_BACKOFF_MS);

      await promise;

      expect(mockNotifyRateLimitHit).toHaveBeenCalledTimes(1);
      // Equal Jitter: capped=1000, half=500, backoff=500+Math.floor(0.5*500)=750
      expect(mockNotifyRateLimitHit).toHaveBeenCalledWith(750);
    });

    it('グローバル一時停止とモデルレート制限が同時にアクティブな場合、両方の待機が発生する', async () => {
      jest.useFakeTimers();
      // グローバル一時停止: 2000ms
      mockGetGlobalPauseRemainingMs
        .mockReturnValueOnce(2000)
        .mockReturnValue(0);
      // モデルレート制限: 1000ms（グローバル一時停止後に評価される）
      mockGetWaitTimeMs.mockReturnValueOnce(1000).mockReturnValue(0);

      const expected = { object: { foo: 'bar' } };
      const generateFn = jest.fn().mockResolvedValue(expected);

      const promise = withAIControl(generateFn);

      // グローバル一時停止 + モデルレート制限分のタイマーを進める
      await jest.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(1);
      // 両方のチェック関数が呼ばれたことを確認
      expect(mockGetGlobalPauseRemainingMs).toHaveBeenCalled();
      expect(mockGetWaitTimeMs).toHaveBeenCalled();
    });
  });

  describe('異常系・エッジケース', () => {
    it('AbortSignal既にaborted → 即座にthrow', async () => {
      const controller = new AbortController();
      controller.abort();

      const generateFn = jest.fn().mockResolvedValue({ object: {} });

      await expect(
        withAIControl(generateFn, { abortSignal: controller.signal }),
      ).rejects.toThrow();

      expect(generateFn).not.toHaveBeenCalled();
    });

    it('レート制限でもパースエラーでもないエラー → リトライせずthrow', async () => {
      const unexpectedError = new Error('unexpected');

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockReturnValue(false);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockReturnValue(false);

      const generateFn = jest.fn().mockRejectedValue(unexpectedError);

      await expect(withAIControl(generateFn)).rejects.toThrow(unexpectedError);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('レート制限エラーとパースエラーが連続で発生するケース', async () => {
      jest.useFakeTimers();

      const rateLimitError = new Error('rate limit');
      const parseError = new Error('parse error');
      const expected = { object: { success: true } };

      // 1回目: レート制限エラー、2回目: パースエラー、3回目: 成功
      const generateFn = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(parseError)
        .mockResolvedValue(expected);

      jest
        .spyOn(agentUtils, 'judgeErrorIsRateLimitError')
        .mockImplementation((err) => err === rateLimitError);
      jest
        .spyOn(agentUtils, 'judgeNoObjectGeneratedError')
        .mockImplementation((err) => err === parseError);

      const promise = withAIControl(generateFn);

      // レート制限バックオフのタイマーを進める
      await jest.advanceTimersByTimeAsync(60_000);

      const result = await promise;
      expect(result).toBe(expected);
      expect(generateFn).toHaveBeenCalledTimes(3);
    });
  });
});
