import Logger from 'electron-log';
import log from 'electron-log/main';

const logLevel = getLogLevel();
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

export function getLogLevel() {
  let logLevel: 'debug' | 'info';
  if (process.env.AIKATA_LOG_DEBUG !== undefined) {
    // 環境変数が設定されていれば強制 debug
    logLevel = 'debug';
  } else {
    // 通常は NODE_ENV で切り替え
    logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  }
  return logLevel;
}
