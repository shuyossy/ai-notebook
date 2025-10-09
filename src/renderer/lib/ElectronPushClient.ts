import type { Channel, PushClient, PushEvent } from '@/types';
import { internalError } from './error';

// Rendererプロセス側で使うPushクライアント実装
export class ElectronPushClient implements PushClient {
  subscribe<C extends Channel>(
    channel: C,
    onEvent: (ev: PushEvent<C>) => void,
    opts?: { signal?: AbortSignal },
  ): () => void {
    if (!window.electron.pushApi) {
      throw internalError('pushApi not available', {
        expose: false,
      });
    }
    // preload経由で購読登録
    let unsub = () => {};
    // 非同期を吸収するため、即時IIFEで握る
    (async () => {
      unsub = await window.electron.pushApi.subscribe(channel, onEvent);
    })();
    // AbortSignalで解除できるようにする
    opts?.signal?.addEventListener('abort', () => {
      unsub();
    });
    return () => unsub();
  }

  /**
   * 購読を非同期で開始し、購読完了を待つ
   * イベントの取りこぼしを防ぐため、購読完了を保証する
   */
  async subscribeAsync<C extends Channel>(
    channel: C,
    onEvent: (ev: PushEvent<C>) => void,
    opts?: { signal?: AbortSignal },
  ): Promise<() => void> {
    if (!window.electron.pushApi) {
      throw internalError('pushApi not available', {
        expose: false,
      });
    }
    // preload経由で購読登録（完了を待つ）
    const unsub = await window.electron.pushApi.subscribe(channel, onEvent);

    // AbortSignalで解除できるようにする
    opts?.signal?.addEventListener('abort', () => {
      unsub();
    });
    return unsub;
  }
}
