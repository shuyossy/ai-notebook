import Logger from 'electron-log';
import log from 'electron-log/main';
import { getCustomAppDataDir } from '../main';
import path from 'path';

log.initialize();
const logLevel = getLogLevel();
log.transports.file.level = logLevel;
log.transports.console.level = logLevel;
log.transports.file.resolvePathFn = () =>
  path.join(getCustomAppDataDir(), 'main.log');

// シングルトン変数
let _mainLogger: Logger.MainLogger | null = null;
let _pluginLogger: Logger.MainLogger | null = null;

export function getMainLogger() {
  if (!_mainLogger) {
    _mainLogger = log;
  }
  return _mainLogger;
}

/**
 * プラグイン専用ロガーを取得
 * plugin.logに全てのログレベル（debug以上）を出力
 */
export function getPluginLogger() {
  if (!_pluginLogger) {
    const pluginLogger = log.create({ logId: 'plugin' });

    // プラグインログは常にdebug以上を出力
    pluginLogger.transports.file.level = 'debug';
    pluginLogger.transports.console.level = 'debug';

    // plugin.logに出力
    pluginLogger.transports.file.resolvePathFn = () =>
      path.join(getCustomAppDataDir(), 'plugin.log');

    _pluginLogger = pluginLogger;
  }
  return _pluginLogger;
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
