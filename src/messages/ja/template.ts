export const template = {
  PLAIN_MESSAGE: `{message}`,
  UNKNOWN_ERROR: `予期せぬエラーが発生しました`,
  VALIDATION_ERROR: `入力内容に誤りがあります\n{detail}`,
  DATA_ACCESS_ERROR: `データ操作中にエラーが発生しました\n{detail}`,
  IPC_ERROR: `{hasIpcName, select,
    true {
      {hasDetail, select,
        true {{ipcName}処理でエラーが発生しました\n{detail}}
        other {{ipcName}処理で予期せぬエラーが発生しました}
      }
    }
    other {予期せぬエラーが発生しました}
  }`,
  SERVER_INITIALIZE_ERROR: `アプリケーションの起動中にエラーが発生しました\n{detail}`,
  MASTRA_MEMORY_ERROR: `チャットデータの取得に失敗しました`,
  CHAT_GENERATE_ERROR: `テキスト生成に失敗しました\n{detail}`,
  GITLAB_API_CONNECTION_ERROR: `GitLab APIへの接続に失敗しました`,
  REDMINE_API_CONNECTION_ERROR: `Redmine APIへの接続に失敗しました`,
  FS_OPEN_DIALOG_ERROR: `ファイルダイアログの表示に失敗しました`,
  FILE_TEXT_EXTRACTION_ERROR: `ファイルのテキスト抽出に失敗しました\n{path}`,
  SOURCE_REGISTRATION_DIR_READING_ERROR: `ドキュメント登録用ディレクトリの読み込みに失敗しました`,
  REVIEW_CHECKLIST_EXTRACTION_ERROR: `チェックリスト抽出処理に失敗しました\n{detail}`,
  REVIEW_EXECUTION_ERROR: `レビュー実行処理に失敗しました\n{detail}`,
  AI_API_ERROR: `AIのAPIと通信中にエラーが発生しました\n{detail}`,
} as const;
