import type { Channel, PushClient, PushEvent } from '@/types';

// Rendererプロセス側で使うPushクライアント実装
export class ElectronPushClient implements PushClient {
  subscribe<C extends Channel>(
    channel: C,
    onEvent: (ev: PushEvent<C>) => void,
    opts?: { signal?: AbortSignal },
  ): () => void {
    if (!window.electron.pushApi) throw new Error('pushApi not available');
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
}
