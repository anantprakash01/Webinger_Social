/**
 * One date rule for the whole app (UX pass):
 * - past moments under a week old are relative ("5 min ago", "3 h ago", "2 days ago");
 * - anything older, or in the future, is an absolute date ("Nov 3" this year, "Nov 3, 2025" otherwise);
 * - deadlines are countdowns ("2 d 4 h left"), see features/orders/format.ts.
 * Audit trails (order timeline, audit log) show the absolute date and time on purpose.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatDate(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatDateTime(iso: string, now = Date.now()): string {
  return `${formatDate(iso, now)}, ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function formatWhen(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 0 || diff >= 7 * DAY) return formatDate(iso, now);
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  const d = Math.floor(diff / DAY);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
