import Logger from 'electron-log';
import log from 'electron-log/main';

const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
log.transports.file.level = logLevel;
log.transports.console.level = logLevel;

// シングルトン変数
let _mainLogger: Logger.MainLogger | null = null;

export function getMainLogger() {
  if (!_mainLogger) {
    log.initialize();
    _mainLogger = log;
  }
  return _mainLogger;
}
