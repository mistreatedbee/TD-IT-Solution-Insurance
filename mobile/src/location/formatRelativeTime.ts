/**
 * Human-readable relative time for "Last seen X ago".
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';

  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'Just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
