import { EventChannel, IpcEventPayloadMap } from "./ipc";

export type Channel = EventChannel;

export type PushEvent<C extends Channel = Channel> = {
  channel: C;
  payload: IpcEventPayloadMap[C];     // ドメイン固有データ
  ts: number;     // サーバでの生成時刻(ms)
};

// サーバ側で「クライアント接続（ストリーム）」を表すシンク
export type StreamSink<C extends Channel = Channel> = {
  id?: string;                                // 省略可。未指定ならBroker側で採番
  write: (ev: PushEvent<C>) => void;          // クライアントへ送出
  close?: () => void;                         // 切断時の後始末（任意）
};

// サーバ側で使う共通ブローカー
export interface PushBroker {
  // ドメイン／サービスは基本これだけ呼べばOK（push送信）
  publish<C extends Channel = Channel>(channel: C, ev: PushEvent<C>): void;

  // 下位トランスポート（アプリ形態に合わせてSSE/ElectronIPC等を選択）が「接続（購読）を登録」
  registerStream<C extends Channel = Channel>(
    channel: C,
    sink: StreamSink<C>
  ): () => void;  // 解除用のunsubscribeを返す
}

export interface PushClient {
  subscribe<C extends Channel>(
    channel: C,
    onEvent: (ev: PushEvent<C>) => void,
    opts?: { signal?: AbortSignal }
  ): () => void;
}
