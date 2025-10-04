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
  CHAT_EDIT_ERROR: `メッセージの編集に失敗しました\n{detail}`,
  GITLAB_API_CONNECTION_ERROR: `GitLab APIへの接続に失敗しました`,
  REDMINE_API_CONNECTION_ERROR: `Redmine APIへの接続に失敗しました`,
  REDMINE_API_ERROR: `Redmine APIとの通信中にエラーが発生しました\n{detail}`,
  FS_OPEN_DIALOG_ERROR: `ファイルダイアログの表示に失敗しました`,
  FILE_TEXT_EXTRACTION_ERROR: `ファイルのテキスト抽出に失敗しました\n{path}`,
  FS_CONVERT_OFFICE_TO_PDF_ERROR: `ファイルのPDF変換に失敗しました\n{detail}`,
  SOURCE_REGISTRATION_DIR_READING_ERROR: `ドキュメント登録用ディレクトリの読み込みに失敗しました`,
  SOURCE_REGISTRATION_DIR_NOT_SET: `ドキュメント登録用ディレクトリが設定されていません\n設定画面で登録用ディレクトリを指定してください`,
  REVIEW_CHECKLIST_EXTRACTION_ERROR: `チェックリスト抽出処理に失敗しました\n{detail}`,
  REVIEW_EXECUTION_ERROR: `レビュー実行処理に失敗しました\n{detail}`,
  REVIEW_CHECKLIST_EXTRACTION_OVER_MAX_TOKENS: `チェックリストの抽出結果がAIモデルの最大出力トークン数を超え、不正な出力となった為修正を試みましたが失敗しました。抽出結果が最大出力トークン内に収まるようにチェックリストのファイル分割を検討してください。`,
  REVIEW_CHECKLIST_EXTRACTION_NOT_CHECKLIST_DOCUMENT: `チェックリスト抽出に適さないドキュメントとして判定されたため処理を終了しました`,
  REVIEW_CHECKLIST_EXTRACTION_NO_CHECKLIST_ITEM: `チェックリストが抽出されませんでした`,
  REVIEW_EXECUTION_NO_TARGET_CHECKLIST: `対象のチェックリストが存在しないためレビューを実行できませんでした`,
  REVIEW_CHECKLIST_EXTRACTION_FROM_CSV_ERROR: `CSVファイルからのチェックリスト抽出中に予期せぬエラーが発生しました`,
  AI_API_ERROR: `AIのAPIと通信中にエラーが発生しました\n{detail}`,
} as const;
