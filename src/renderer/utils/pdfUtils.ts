import * as pdfjsLib from 'pdfjs-dist';

// PDF.jsのワーカーを設定
const workerUrl = new URL('pdf.worker.mjs', window.location.href).toString();
const worker = new Worker(workerUrl, { type: 'module' });
pdfjsLib.GlobalWorkerOptions.workerPort = worker;

/**
 * PDF を PNG(Base64 DataURL) の配列に変換
 * @param arrayBuffer Main 経由で取得した PDF の ArrayBuffer
 * @param opts.scale レンダリング解像度（デフォルト 2.0）
 */
export const convertPdfBytesToImages = async (
  data: Uint8Array | ArrayBufferLike,
  opts: { scale?: number } = {},
): Promise<string[]> => {
  const scale = opts.scale ?? 2.0;

  // data が Uint8Array でなければ Uint8Array に包む
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const images: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context could not be created');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/png'));
  }
  return images;
};

/**
 * 画像データURL配列を縦に結合して1枚のPNGにする
 */
export const combineImages = async (
  imageDataArray: string[],
): Promise<string> => {
  if (imageDataArray.length === 0) throw new Error('画像データが空です');
  if (imageDataArray.length === 1) return imageDataArray[0];

  const images = await Promise.all(
    imageDataArray.map(
      (data) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = data;
        }),
    ),
  );

  const maxWidth = Math.max(...images.map((img) => img.width));
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context could not be created');

  canvas.width = maxWidth;
  canvas.height = totalHeight;

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, maxWidth, totalHeight);

  let currentY = 0;
  for (const img of images) {
    context.drawImage(img, 0, currentY);
    currentY += img.height;
  }

  return canvas.toDataURL('image/png');
};
