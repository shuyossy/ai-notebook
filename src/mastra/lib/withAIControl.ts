import { getSettingsRepository } from '@/adapter/db';
import {
  judgeErrorIsRateLimitError,
  judgeNoObjectGeneratedError,
} from './agentUtils';
import {
  getWaitTimeMs,
  recordRequest,
  notifyRateLimitHit,
  getGlobalPauseRemainingMs,
} from './rateLimiter';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

// レート制限エラーリトライの最大回数
const MAX_RATE_LIMIT_RETRIES = 10;

// パースエラーリトライの最大回数
const MAX_PARSE_ERROR_RETRIES = 3;

// バックオフの基底時間（ミリ秒）
const BASE_BACKOFF_MS = 1000;

// バックオフの最大時間（ミリ秒）
const MAX_BACKOFF_MS = 60_000;

/**
 * AbortSignal対応のsleep関数
 */
function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    abortSignal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortSignal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * バックオフ時間を計算する（指数バックオフ+ジッター）
 */
function calculateBackoff(retryCount: number): number {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, retryCount - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  // Equal Jitter: 値域 [capped/2, capped) — 常に意味のある待機時間を保証
  const half = Math.ceil(capped / 2);
  return half + Math.floor(Math.random() * half);
}

/**
 * AI API実行制御ラッパー関数
 *
 * generateLegacy等のAI API呼び出しをコールバックとして受け取り、
 * レート制限制御・エラーリトライを適用する。
 *
 * - レート制限: モデル毎のスライディングウィンドウ方式で制御
 * - レート制限エラー: 指数バックオフ+ジッターで最大10回リトライ
 * - パースエラー（NoObjectGeneratedError）: 即時リトライ、最大3回
 * - その他のエラー: そのままthrow
 */
export async function withAIControl<T>(
  generateFn: () => Promise<T>,
  options?: { abortSignal?: AbortSignal },
): Promise<T> {
  const { abortSignal } = options ?? {};

  // AbortSignalが既にabortされている場合は即座にthrow
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
  }

  // モデル名を取得
  const settingsRepository = getSettingsRepository();
  const settings = await settingsRepository.getSettings();
  const modelName = settings.api.model;

  let rateLimitRetries = 0;
  let parseErrorRetries = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // グローバル一時停止チェック
    const globalPause = getGlobalPauseRemainingMs();
    if (globalPause > 0) {
      logger.debug(`グローバルレート制限一時停止: ${globalPause}ms待機`);
      await sleep(globalPause, abortSignal);
    }

    // モデル別レート制限待機
    const waitTime = getWaitTimeMs(modelName);
    if (waitTime > 0) {
      logger.debug(`レート制限待機: ${modelName} - ${waitTime}ms待機`);
      await sleep(waitTime, abortSignal);
    }

    // リクエスト記録
    recordRequest(modelName);

    try {
      return await generateFn();
    } catch (error) {
      // レート制限エラー
      if (judgeErrorIsRateLimitError(error)) {
        rateLimitRetries++;
        if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
          throw error;
        }
        const backoff = calculateBackoff(rateLimitRetries);
        // 全並行呼び出しにレート制限を通知
        notifyRateLimitHit(backoff);
        logger.debug(
          `レート制限エラーリトライ (${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}): ${backoff}ms待機`,
        );
        await sleep(backoff, abortSignal);
        continue;
      }

      // パースエラー（構造化出力時）
      if (judgeNoObjectGeneratedError(error)) {
        parseErrorRetries++;
        if (parseErrorRetries > MAX_PARSE_ERROR_RETRIES) {
          throw error;
        }
        logger.debug(
          `パースエラーリトライ (${parseErrorRetries}/${MAX_PARSE_ERROR_RETRIES})`,
        );
        continue;
      }

      // その他のエラーはそのままthrow
      throw error;
    }
  }
}
