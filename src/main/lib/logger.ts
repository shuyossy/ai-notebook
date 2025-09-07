import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import pino, { Logger } from 'pino';

function ensureLogDir(): string {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createMainLogger(): Logger {
  const logDir = ensureLogDir();
  const logFilePath = path.join(logDir, 'app.log');

  // 本番: コンソールは JSON（デフォルト）、開発: pino-pretty を使って見やすく
  const consoleStream =
    process.env.NODE_ENV === 'development'
      ? pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            singleLine: true,
          },
        })
      : process.stdout; // 本番はそのまま

  const fileStream = pino.destination({ dest: logFilePath, append: false, sync: false });

  // マルチ出力: コンソール + ファイル
  const streams = pino.multistream([
    { stream: consoleStream },
    { stream: fileStream },
  ]);

  const logger = pino(
    {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      base: { pid: process.pid, app: 'AIKATA', proc: 'main' },
    },
    streams
  );

  logger.info({ logFilePath }, 'Logger initialized');
  return logger;
}

// シングルトン変数
let _mainLogger: Logger | null = null;
export function getMainLogger(): Logger {
  if (!_mainLogger) _mainLogger = createMainLogger();
  return _mainLogger;
}
