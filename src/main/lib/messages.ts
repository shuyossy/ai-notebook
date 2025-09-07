import { IntlMessageFormat } from 'intl-messageformat';
import { MessageCode } from '@/types';
import { template } from '@/messages/ja/template';

export type MessageParams = Record<string, unknown>;

export function formatMessage(
  code: MessageCode,
  params: MessageParams = {},
): string {
  const message = template[code];

  // 未定義IDは安全にフォールバック
  if (!template) {
    // TODO: 本番ではログに記録して、ユーザには無難な文言を返す
    return template['UNKNOWN_ERROR'] ?? '予期せぬエラーが発生しました。';
  }

  // ICUメッセージを解釈してレンダリング
  const mf = new IntlMessageFormat(message, 'ja');
  return mf.format(params) as string;
}
