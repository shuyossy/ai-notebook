import { OpenDialogOptions } from 'electron';
import type { ChatMessage, ChatRoom } from './chat';
import { AppErrorPayload } from './error';
import type {
  DocumentType,
  UploadFile,
  ReviewChecklistResult,
  ReviewChecklistEdit,
  ChecklistExtractionResultStatus,
  ReviewExecutionResultStatus,
  CustomEvaluationSettings,
  DocumentMode,
} from './review';
import type { SettingsSavingStatus, Settings } from './setting';
import type { Source, RevieHistory } from '@/types';

type IpcSuccess<T> = {
  success: true;
  data?: T;
};

type IpcError = {
  success: false;
  error: AppErrorPayload;
};

export type IpcResult<T = never> = IpcSuccess<T> | IpcError;

/**
 * IPC通信で使用するチャネル名の定義
 */
export const IpcChannels = {
  // Agent関連
  GET_SETTINGS_STATUS: 'get-settings-status',
  SETTINGS_STATUS_CHANGED: 'settings-status-changed',
  SETTINGS_UPDATE_FINISHED: 'settings-update-finished', // 設定更新処理が完了した際の通知
  REINITIALIZE_SETTINGS: 'reinitialize-settings',
  REMOVE_SETTINGS_MESSAGE: 'remove-settings-message',

  // 設定関連
  GET_SETTINGS: 'get-settings',
  SET_SETTINGS: 'set-settings',

  // ソース関連
  SOURCE_GET_ALL: 'source-get-all',
  SOURCE_RELOAD: 'source-reload',
  SOURCE_RELOAD_FINISHED: 'source-reload-finished', // ドキュメント更新処理が完了した際の通知
  SOURCE_UPDATE_ENABLED: 'source-update-enabled',

  // チャット関連
  CHAT_SEND_MESSAGE: 'chat-send-message',
  CHAT_GET_ROOMS: 'chat-get-rooms',
  CHAT_GET_MESSAGES: 'chat-get-messages',
  CHAT_DELETE_ROOM: 'chat-delete-room',
  CHAT_CREATE_THREAD: 'chat-create-thread',
  CHAT_STREAM: 'chat-stream',
  CHAT_COMPLETE: 'chat-complete',
  CHAT_STEP: 'chat-step',
  CHAT_ERROR: 'chat-error',
  CHAT_ABORT_REQUEST: 'chat-abort-request',
  CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID:
    'chat-delete-messages-before-specific-id',

  // ファイルシステム関連
  FS_CHECK_PATH_EXISTS: 'fs-check-path-exists',
  FS_SHOW_OPEN_DIALOG: 'fs-show-open-dialog',
  FS_READ_FILE: 'fs-read-file',
  FS_CONVERT_OFFICE_TO_PDF: 'fs-convert-office-to-pdf',
  FS_CONVERT_OFFICE_TO_PDF_PROGRESS: 'fs-convert-office-to-pdf-progress',

  // ドキュメントレビュー関連
  REVIEW_GET_HISTORIES: 'review-get-histories', // ドキュメント履歴切り替え時やチェックリスト抽出・ドキュメントレビュー時のポーリング処理にて呼び出される
  REVIEW_GET_HISTORY_DETAIL: 'review-get-history-detail',
  REVIEW_GET_HISTORY_INSTRUCTION: 'review-get-history-instruction',
  REVIEW_DELETE_HISTORY: 'review-delete-history',
  REVIEW_EXTRACT_CHECKLIST_CALL: 'review-extract-checklist-call', // チェックリスト抽出処理を開始する
  REVIEW_EXTRACT_CHECKLIST_FINISHED: 'review-extract-checklist-finished', // チェックリスト抽出が完了した際の通知
  REVIEW_EXTRACT_CHECKLIST_ABORT: 'review-extract-checklist-abort', // チェックリスト抽出処理をキャンセルする
  REVIEW_UPDATE_CHECKLIST: 'review-update-checklist',
  REVIEW_EXECUTE_CALL: 'review-execute', // ドキュメントレビューを開始する
  REVIEW_EXECUTE_FINISHED: 'review-execute-finished', // レビュー実行が完了した際の通知
  REVIEW_EXECUTE_ABORT: 'review-execute-abort', // レビュー実行処理をキャンセルする
  REVIEW_HISTORY_UPDATED: 'review-history-updated', // レビュー履歴が更新された際の通知
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * IPC通信のペイロード型マッピング
 * 各チャネルごとにリクエストとレスポンスの型を厳密に定義
 */
export type IpcRequestPayloadMap = {
  // Mastra関連
  [IpcChannels.GET_SETTINGS_STATUS]: undefined;
  [IpcChannels.REINITIALIZE_SETTINGS]: undefined;
  [IpcChannels.REMOVE_SETTINGS_MESSAGE]: string; // message id

  // 設定関連
  [IpcChannels.GET_SETTINGS]: undefined;
  [IpcChannels.SET_SETTINGS]: Settings;

  // ファイルシステム関連
  [IpcChannels.FS_CHECK_PATH_EXISTS]: string;
  [IpcChannels.FS_SHOW_OPEN_DIALOG]: OpenDialogOptions;
  [IpcChannels.FS_READ_FILE]: string; // file path
  [IpcChannels.FS_CONVERT_OFFICE_TO_PDF]: string; // file path

  // ソース関連
  [IpcChannels.SOURCE_GET_ALL]: undefined;
  [IpcChannels.SOURCE_RELOAD]: undefined;
  [IpcChannels.SOURCE_UPDATE_ENABLED]: { sourceId: number; isEnabled: boolean };

  // チャット関連
  [IpcChannels.CHAT_SEND_MESSAGE]: { roomId: string; messages: ChatMessage[] };
  [IpcChannels.CHAT_GET_ROOMS]: undefined;
  [IpcChannels.CHAT_GET_MESSAGES]: string; // threadId
  [IpcChannels.CHAT_DELETE_ROOM]: string; // threadId
  [IpcChannels.CHAT_CREATE_THREAD]: {
    roomId: string;
    title: string;
  };
  [IpcChannels.CHAT_ABORT_REQUEST]: { threadId: string };
  [IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]: {
    threadId: string;
    messageId: string;
  };

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: undefined;
  [IpcChannels.REVIEW_GET_HISTORY_DETAIL]: string; // review history id
  [IpcChannels.REVIEW_GET_HISTORY_INSTRUCTION]: string; // review history id
  [IpcChannels.REVIEW_DELETE_HISTORY]: string; // review history id
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]: {
    reviewHistoryId: string;
    files: UploadFile[];
    documentType?: DocumentType;
    checklistRequirements?: string;
  };
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_ABORT]: string; // review history id
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: {
    reviewHistoryId: string;
    checklistEdits: ReviewChecklistEdit[];
  };
  [IpcChannels.REVIEW_EXECUTE_CALL]: {
    reviewHistoryId: string;
    files: UploadFile[];
    additionalInstructions?: string;
    commentFormat?: string;
    evaluationSettings: CustomEvaluationSettings;
    documentMode: DocumentMode;
  };
  [IpcChannels.REVIEW_EXECUTE_ABORT]: string; // review history id
};

export type IpcResponsePayloadMap = {
  // Mastra関連
  [IpcChannels.GET_SETTINGS_STATUS]: IpcResult<SettingsSavingStatus>;
  [IpcChannels.REINITIALIZE_SETTINGS]: IpcResult;
  [IpcChannels.REMOVE_SETTINGS_MESSAGE]: IpcResult;

  // 設定関連
  [IpcChannels.GET_SETTINGS]: IpcResult<Settings>;
  [IpcChannels.SET_SETTINGS]: IpcResult<boolean>;

  // ファイルシステム関連
  [IpcChannels.FS_CHECK_PATH_EXISTS]: IpcResult<boolean>;
  [IpcChannels.FS_SHOW_OPEN_DIALOG]: IpcResult<{
    filePaths: string[];
    canceled: boolean;
  }>;
  [IpcChannels.FS_READ_FILE]: IpcResult<Uint8Array>; // ファイルのバイナリデータ
  [IpcChannels.FS_CONVERT_OFFICE_TO_PDF]: IpcResult<Uint8Array>; // 変換後のPDFバイナリデータ

  // ソース関連
  [IpcChannels.SOURCE_GET_ALL]: IpcResult<Source[]>;
  [IpcChannels.SOURCE_RELOAD]: IpcResult<{ message?: string }>;
  [IpcChannels.SOURCE_UPDATE_ENABLED]: IpcResult;

  // チャット関連
  [IpcChannels.CHAT_SEND_MESSAGE]: IpcResult;
  [IpcChannels.CHAT_GET_ROOMS]: IpcResult<ChatRoom[]>;
  [IpcChannels.CHAT_GET_MESSAGES]: IpcResult<ChatMessage[]>;
  [IpcChannels.CHAT_DELETE_ROOM]: IpcResult;
  [IpcChannels.CHAT_CREATE_THREAD]: IpcResult;
  [IpcChannels.CHAT_ABORT_REQUEST]: IpcResult;
  [IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]: IpcResult;

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: IpcResult<RevieHistory[]>;
  [IpcChannels.REVIEW_GET_HISTORY_DETAIL]: IpcResult<{
    checklistResults?: ReviewChecklistResult[];
  }>;
  [IpcChannels.REVIEW_GET_HISTORY_INSTRUCTION]: IpcResult<{
    additionalInstructions?: string;
    commentFormat?: string;
    evaluationSettings?: CustomEvaluationSettings;
  }>;
  [IpcChannels.REVIEW_DELETE_HISTORY]: IpcResult;
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]: IpcResult;
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_ABORT]: IpcResult;
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: IpcResult;
  [IpcChannels.REVIEW_EXECUTE_CALL]: IpcResult;
  [IpcChannels.REVIEW_EXECUTE_ABORT]: IpcResult;
};

export type IpcEventPayloadMap = {
  [IpcChannels.CHAT_STREAM]: any; // AI SDKが定義するDataStreamが入る想定(型がexportされていないためany型)
  [IpcChannels.CHAT_COMPLETE]: unknown;
  [IpcChannels.CHAT_ERROR]: { message: string };
  [IpcChannels.SETTINGS_UPDATE_FINISHED]: { success: boolean; error?: string }; // 設定更新処理完了通知
  [IpcChannels.SOURCE_RELOAD_FINISHED]: { success: boolean; error?: string }; // ドキュメント更新処理完了通知
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED]: {
    reviewHistoryId: string;
    status: ChecklistExtractionResultStatus;
    error?: string;
  };
  [IpcChannels.REVIEW_EXECUTE_FINISHED]: {
    reviewHistoryId: string;
    status: ReviewExecutionResultStatus;
    error?: string;
  };
  [IpcChannels.REVIEW_HISTORY_UPDATED]: undefined;
  [IpcChannels.FS_CONVERT_OFFICE_TO_PDF_PROGRESS]: {
    fileName: string;
    progressType: 'sheet-setup' | 'pdf-export';
    sheetName?: string;
    currentSheet?: number;
    totalSheets?: number;
  };
};

/**
 * 型安全性を確保するためのヘルパー型
 */
export type IpcRequestPayload<T extends keyof IpcRequestPayloadMap> =
  IpcRequestPayloadMap[T];

export type IpcResponsePayload<T extends keyof IpcResponsePayloadMap> =
  IpcResponsePayloadMap[T];

export type IpcEventPayload<T extends keyof IpcEventPayloadMap> =
  IpcEventPayloadMap[T];

export type RequestChannel = keyof IpcRequestPayloadMap;
export type ResponseChannel = keyof IpcResponsePayloadMap;
export type EventChannel = keyof IpcEventPayloadMap;

// チャネル名と処理内容のマッピング（ログ出力やエラー処理などで使用）
export const IpcNameMap = {
  // Mastra関連
  [IpcChannels.GET_SETTINGS_STATUS]: 'AIツール情報の取得',
  [IpcChannels.REINITIALIZE_SETTINGS]: 'AIツール情報の更新',
  [IpcChannels.REMOVE_SETTINGS_MESSAGE]: 'AIツール情報メッセージの削除',

  // 設定関連
  [IpcChannels.GET_SETTINGS]: '設定情報の取得',
  [IpcChannels.SET_SETTINGS]: '設定情報の更新',

  // ファイルシステム関連
  [IpcChannels.FS_CHECK_PATH_EXISTS]: 'ファイルパスの存在確認',
  [IpcChannels.FS_SHOW_OPEN_DIALOG]: 'ファイルダイアログ表示',
  [IpcChannels.FS_READ_FILE]: 'ファイル読み込み',
  [IpcChannels.FS_CONVERT_OFFICE_TO_PDF]: 'ファイルのPDF変換',

  // ソース関連
  [IpcChannels.SOURCE_GET_ALL]: 'ドキュメント情報の取得',
  [IpcChannels.SOURCE_RELOAD]: 'ドキュメント情報の再読み込み',
  [IpcChannels.SOURCE_UPDATE_ENABLED]: 'ドキュメントの有効/無効更新',

  // チャット関連
  [IpcChannels.CHAT_SEND_MESSAGE]: 'チャットメッセージ送信',
  [IpcChannels.CHAT_GET_ROOMS]: 'チャット履歴一覧取得',
  [IpcChannels.CHAT_GET_MESSAGES]: 'チャット履歴取得',
  [IpcChannels.CHAT_DELETE_ROOM]: 'チャットルーム削除',
  [IpcChannels.CHAT_CREATE_THREAD]: 'チャットルーム作成',
  [IpcChannels.CHAT_ABORT_REQUEST]: 'チャット中断',
  [IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]:
    'チャットメッセージ削除',

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: 'レビュー結果一覧の取得',
  [IpcChannels.REVIEW_GET_HISTORY_DETAIL]: 'レビュー結果詳細の取得',
  [IpcChannels.REVIEW_GET_HISTORY_INSTRUCTION]: 'レビュー指示内容の取得',
  [IpcChannels.REVIEW_DELETE_HISTORY]: 'レビュー結果の削除',
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]: 'チェックリストの抽出',
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_ABORT]: 'チェックリスト抽出の中断',
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: 'チェックリストの更新',
  [IpcChannels.REVIEW_EXECUTE_CALL]: 'ドキュメントレビューの実行',
  [IpcChannels.REVIEW_EXECUTE_ABORT]: 'ドキュメントレビューの中断',
};
