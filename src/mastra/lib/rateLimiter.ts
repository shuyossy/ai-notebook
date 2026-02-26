import { MODEL_RATE_LIMITS, DEFAULT_RATE_LIMIT } from '@/config/modelConfig';

// スライディングウィンドウのサイズ（1分間）
const WINDOW_MS = 60_000;

// モデルごとのリクエストタイムスタンプを保持するMap
const requestTimestamps: Map<string, number[]> = new Map();

// グローバル一時停止の終了時刻（0 = 停止なし）
let globalPauseUntil = 0;

/**
 * モデルのレート制限上限を取得する
 */
function getRateLimit(modelName: string): number {
  return MODEL_RATE_LIMITS[modelName] ?? DEFAULT_RATE_LIMIT;
}

/**
 * ウィンドウ内のリクエストタイムスタンプを取得し、古いものを除去する
 */
function getActiveTimestamps(modelName: string): number[] {
  const now = Date.now();
  const timestamps = requestTimestamps.get(modelName) || [];
  const active = timestamps.filter((ts) => now - ts < WINDOW_MS);
  requestTimestamps.set(modelName, active);
  return active;
}

/**
 * 次のリクエストまでの待機時間（ミリ秒）を返す
 * ウィンドウ内のリクエスト数が上限に達していなければ0を返す
 */
export function getWaitTimeMs(modelName: string): number {
  const limit = getRateLimit(modelName);
  const active = getActiveTimestamps(modelName);

  if (active.length < limit) {
    return 0;
  }

  // 最古のタイムスタンプがウィンドウ外に出るまでの待機時間
  const oldest = active[0];
  const now = Date.now();
  return oldest + WINDOW_MS - now;
}

/**
 * リクエスト実行を記録する
 */
export function recordRequest(modelName: string): void {
  const timestamps = requestTimestamps.get(modelName) || [];
  timestamps.push(Date.now());
  requestTimestamps.set(modelName, timestamps);
}

/**
 * レート制限エラー検知時にグローバル一時停止を設定する
 * 既存の一時停止より短い場合は上書きしない
 */
export function notifyRateLimitHit(backoffMs: number): void {
  const pauseUntil = Date.now() + backoffMs;
  if (pauseUntil > globalPauseUntil) {
    globalPauseUntil = pauseUntil;
  }
}

/**
 * グローバル一時停止の残り時間（ミリ秒）を返す
 * 停止不要の場合は0を返す
 */
export function getGlobalPauseRemainingMs(): number {
  const remaining = globalPauseUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * テスト用: レート制限の状態をリセットする
 */
export function resetRateLimiter(): void {
  requestTimestamps.clear();
  globalPauseUntil = 0;
}
