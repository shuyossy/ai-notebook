import { randomUUID } from 'node:crypto';
import type { Channel, PushEvent, StreamSink, PushBroker } from '@/types';

/**
 * 単一プロセス内で使う軽量ブローカー実装。
 * - Electron Main / Next.js(Nodeランタイム)のどちらでもそのまま使える
 * - 将来スケールが必要なら、この1ファイルを Redis/NATS 版に置き換えればOK
 */
export class InProcPushBroker implements PushBroker {
  // チャンネル -> (subscriberId -> sink)
  private subs = new Map<Channel, Map<string, StreamSink>>();

  publish<C extends Channel>(channel: C, ev: PushEvent<C>): void {
    // 配信
    const sinks = this.subs.get(channel);
    if (!sinks) return;

    for (const sink of sinks.values()) {
      try {
        (sink as StreamSink<C>).write(ev);
      } catch {
        try {
          sink.close?.();
        } finally {
          sinks.delete(sink.id!);
        }
      }
    }
  }

  registerStream<C extends Channel>(
    channel: C,
    sink: StreamSink<C>,
  ): () => void {
    const id = sink.id ?? randomUUID();
    sink.id = id;

    let set = this.subs.get(channel);
    if (!set) {
      set = new Map<string, StreamSink>();
      this.subs.set(channel, set);
    }
    set.set(id, sink as StreamSink);

    // 解除関数
    return () => {
      const s = this.subs.get(channel);
      if (!s) return;
      s.delete(id);
      sink.close?.();
      if (s.size === 0) this.subs.delete(channel);
    };
  }
}
