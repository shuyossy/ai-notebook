import { format } from 'date-fns';

export function generateReviewTitle(sourceTitles: string[] = []): string {
  const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  if (sourceTitles.length > 0) {
    return sourceTitles.join(' / ');
  }
  return `New Review-${now}`;
}
