/** "Just now" / "2 min ago" / "3 h ago" / "4 days ago" — admin location freshness. */
export function formatAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} h ago` : `${Math.round(hrs / 24)} days ago`;
}

/** Last four characters only, e.g. "•••• 0051". Admins see the identifier tail, never the full value, here. */
export function maskTail(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '—';
  const v = value.trim();
  return v.length <= 4 ? '••••' : `•••• ${v.slice(-4)}`;
}
