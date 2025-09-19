// @ts-ignore
import { MCPClient, LogMessage } from '@mastra/mcp';
import { writeFileSync } from 'fs';
import { z } from 'zod';
import { McpSchema } from '@/types';
import { getMainLogger } from '@/main/lib/logger';
import { getCustomAppDataDir } from '@/main/main';
import path from 'path';

const LOG_FILE_PATH = path.join(getCustomAppDataDir(), 'mcp.log');

const systemLogger = getMainLogger();

/**
 * ログメッセージをフォーマットする
 */
const formatLogMessage = (logMessage: LogMessage): string => {
  const timestamp = logMessage.timestamp
    .toISOString()
    .replace('T', ' ')
    .split('.')[0];
  const details = logMessage.details ? JSON.stringify(logMessage.details) : '';
  return `[${timestamp}] [${logMessage.level}] ${logMessage.message} ${details}`.trim();
};

/**
 * ログをファイルに書き込む
 */
const writeLog = (logMessage: LogMessage): void => {
  try {
    const formattedLog = formatLogMessage(logMessage);
    writeFileSync(LOG_FILE_PATH, `${formattedLog}\n`, { flag: 'a' });
  } catch (error) {
    console.error('ログファイルの書き込みに失敗しました:', error);
  }
};

/**
 * ログファイルを削除する
 */
const deleteLogFile = (): void => {
  try {
    writeFileSync(LOG_FILE_PATH, '', { flag: 'w' });
  } catch (error) {
    console.error('ログファイルの削除に失敗しました:', error);
  }
};

/**
 * MCPClientを初期化/アップデートする
 * コネクションエラーの際はログファイルにエラーメッセージを出力する
 */
export const initializeMCPClient = async ({
  mcpConfig,
  id,
}: {
  mcpConfig: z.infer<typeof McpSchema>;
  id: string;
}): Promise<{
  success: boolean;
  mcpClient?: MCPClient;
  logPath: string;
}> => {
  deleteLogFile();
  try {
    // それぞれのサーバ設定にログを設定
    const mcpConfigWithLoggerOption = Object.fromEntries(
      Object.entries(mcpConfig).map(([key, value]) => [
        key,
        {
          ...value,
          logger: writeLog,
        },
      ]),
    );
    // MastraのMCPClientでは、コンストラクタにidを指定することで、パッケージ側でシングルトン変数を利用して（メモリ内で）インスタンスを管理してくれる
    // https://github.com/mastra-ai/mastra/blob/%40mastra/mcp%400.10.4/packages/mcp/src/client/configuration.ts#L9
    const mcpClient = new MCPClient({
      id,
      servers: mcpConfigWithLoggerOption,
    });

    // MCPコネクション確認
    await mcpClient.getToolsets();
    return {
      success: true,
      logPath: LOG_FILE_PATH,
    };
  } catch (error) {
    systemLogger.error(error, 'MCPクライアントの初期化に失敗しました');
    return {
      success: false,
      logPath: LOG_FILE_PATH,
    };
  }
};
