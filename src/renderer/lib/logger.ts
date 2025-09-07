import Logger from 'electron-log';
import log from 'electron-log/renderer';

// シングルトン変数
let _rendererLogger: Logger.RendererLogger | null = null;

export function getRendererLogger() {
  if (!_rendererLogger) {
    _rendererLogger = log;
  }
  return _rendererLogger;
}
