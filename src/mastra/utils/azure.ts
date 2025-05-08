const debugFetch = async (input, init = {}) => {
  // ---------- 送信内容 ----------
  console.debug('=== AzureOpenAI → Request ===');
  console.debug('URL:', input.toString?.() ?? input);
  console.debug('Method:', init.method ?? 'POST');
  console.debug('Headers:', init.headers);
  // ボディは ArrayBuffer / ReadableStream / string 等が来るので分岐
  if (init.body) {
    const bodyText =
      // eslint-disable-next-line
      typeof init.body === 'string'
        ? init.body
        : Buffer.isBuffer(init.body)
          ? init.body.toString()
          : '[stream or non-string body]';
    console.debug('Body:', bodyText);
  }

  // ---------- API 呼び出し ----------
  const res = await fetch(input, init);

  // ---------- 応答内容 ----------
  console.debug('=== AzureOpenAI ← Response ===');
  console.debug('Status:', res.status, res.statusText);
  console.debug('Headers:', Object.fromEntries(res.headers.entries()));

  // ストリームを失わないよう clone() してテキストを取得
  try {
    const cloned = res.clone();
    const text = await cloned.text();
    console.debug('Body:', text);
  } catch (e) {
    console.debug('Body: <unreadable stream>', e);
  }

  return res;
};

export default debugFetch;
