import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { getSafeErrorMessage } from '@/renderer/lib/error';
import { alertStore } from '../../stores/alertStore';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  React.useEffect(() => {
    // エラー発生時にアラートを表示
    alertStore.getState().addAlert({
      severity: 'error',
      message: getSafeErrorMessage(error),
    });

    // エラー詳細をコンソールに出力（開発時のデバッグ用）
    console.error('Application Error:', error);

    // エラー状態をリセットしてアプリを初期化
    const timer = setTimeout(() => {
      resetErrorBoundary();
    }, 100);

    return () => clearTimeout(timer);
  }, [error, resetErrorBoundary]);

  // エラー発生時は一瞬だけ表示してすぐにリセット
  return null;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

export default function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        // エラー情報をログ出力
        console.error('ErrorBoundary caught an error:', error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
