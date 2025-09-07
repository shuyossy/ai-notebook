import { internalError } from '@/main/lib/error';

export function repositoryError(detail: string, error: unknown) {
  return internalError({
    expose: true,
    messageCode: 'DATA_ACCESS_ERROR',
    messageParams: { detail },
    cause: error,
  });
}
