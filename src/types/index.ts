export * from './chat';
export * from './review';
export * from './setting';
export * from './sourceRegister';
export * from './ipc'
export * from './message';
export * from './error';

// パス定義
export const ROUTES = {
  CHAT: '/',
  REVIEW: '/review',
} as const;

export type Feature = keyof typeof ROUTES;

export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;
