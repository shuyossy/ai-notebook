import type { EventChannel, IpcEventPayloadMap, PushEvent } from '@/types';
import { broker } from '@/main/push/electronPushBroker';

/**
 * イベント送信用のペイロードを作成するヘルパー関数
 * @param channel イベントチャンネル
 * @param payload ペイロードデータ
 * @param options オプション（タイムスタンプなど）
 * @returns 作成されたイベントペイロード
 */
export function createEventPayload<C extends EventChannel>(
  channel: C,
  payload: IpcEventPayloadMap[C],
  options?: { timestamp?: number }
): PushEvent<C> {
  return {
    channel,
    payload,
    ts: options?.timestamp ?? Date.now(),
  };
}

/**
 * イベントを送信するヘルパー関数
 * @param channel イベントチャンネル
 * @param payload ペイロードデータ
 * @param options オプション（タイムスタンプなど）
 */
export function publishEvent<C extends EventChannel>(
  channel: C,
  payload: IpcEventPayloadMap[C],
  options?: { timestamp?: number }
): void {
  const eventPayload = createEventPayload(channel, payload, options);
  broker.publish(channel, eventPayload);
}