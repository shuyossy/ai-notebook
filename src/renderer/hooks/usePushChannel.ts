import { useEffect, useMemo, useRef, useState } from 'react';
import { Channel, PushClient, PushEvent } from '@/types';
import { ElectronPushClient } from '../lib/ElectronPushClient';

function createPushClient(): PushClient {
  // Electron 環境なら preload で露出された API が存在
  return new ElectronPushClient();
  // Web/Next.js環境ならSSEクライアントを返す
}

export function usePushChannel<C extends Channel>(
  channel: C,
  onEvent?: (ev: PushEvent<C>) => void,
) {
  const client = useMemo(createPushClient, []);
  const [last, setLast] = useState<PushEvent<C> | null>(null);
  const abortRef = useRef<AbortController>(new AbortController());
  const cbRef = useRef(onEvent);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // 購読処理を非同期で実行
    let unsub: (() => void) | undefined;
    (async () => {
      unsub = await client.subscribeAsync<C>(
        channel,
        (ev) => {
          setLast(ev);
          cbRef.current?.(ev);
        },
        { signal: ac.signal },
      );
    })();

    return () => {
      ac.abort();
      unsub?.();
    };
  }, [channel, client]);

  return last;
}
