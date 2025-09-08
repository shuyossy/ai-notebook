import { ipcMain, webContents } from 'electron';
import { InProcPushBroker } from './InProcBroker';
import type { Channel, PushEvent } from '@/types';

export const broker = new InProcPushBroker();

export const setupElectronPushBroker = () => {
  // Rendererからの購読登録を受け付けて、Brokerに「ストリーム登録」
  ipcMain.handle('push:subscribe', (event, channel: Channel) => {
    const contentsId = event.sender.id;
    const subId = crypto.randomUUID();

    const sink = {
      id: subId,
      write: (ev: PushEvent<typeof channel>) => {
        // 該当Rendererのみに送信（subIdでルーティング）
        const wc = webContents.fromId(contentsId);
        wc?.send(`push:${channel}:${subId}`, ev);
      },
      close: () => {
        /* Renderer側が閉じた時の後始末があれば */
      },
    };

    const unsubscribe = broker.registerStream(channel, sink);

    // 解約テーブルに登録
    unsubscribeMap.set(subId, unsubscribe);
    return { subId };
  });

  ipcMain.handle(
    'push:unsubscribe',
    (_event, _channel: string, subId: string) => {
      const unsub = unsubscribeMap.get(subId);
      if (unsub) {
        unsub();
        unsubscribeMap.delete(subId);
      }
    },
  );
};

const unsubscribeMap = new Map<string, () => void>();
