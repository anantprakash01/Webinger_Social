/**
 * FR-52 + FR-53: one place that delivers a notification. In-app always; email, SMS and WhatsApp per the
 * user's preferences for that category (SMS and WhatsApp are mocked: they land in the demo outbox with
 * the phone number as the recipient). Security emails (verify, reset) don't come through here.
 */
import type { NotificationCategory, NotificationPreferences } from '@/types';
import { getDb, now, ulid, type NotificationRow, type NotificationPrefsRow } from './db';

export const CATEGORIES: NotificationCategory[] = ['ORDERS', 'CAMPAIGNS', 'PAYOUTS', 'ACCOUNT', 'PRODUCT_NEWS'];

/** Defaults: email for everything except product news; SMS and WhatsApp off until a number is added. */
export function defaultPrefs(userId: string): NotificationPrefsRow {
  return {
    userId,
    phone: null,
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, { email: c !== 'PRODUCT_NEWS', sms: false, whatsapp: false }])) as NotificationPrefsRow['categories'],
  };
}

export const prefsOf = (userId: string): NotificationPrefsRow => getDb().notificationPrefs.find((p) => p.userId === userId) ?? defaultPrefs(userId);

export const toPreferences = (p: NotificationPrefsRow): NotificationPreferences => ({
  phone: p.phone,
  categories: CATEGORIES.map((category) => ({ category, ...p.categories[category] })),
});

export interface Delivery {
  type: NotificationRow['type'];
  title: string;
  body: string;
  link: string | null;
}

export function deliver(userId: string, n: Delivery, category: NotificationCategory): void {
  const db = getDb();
  const at = now().toISOString();
  db.notifications.unshift({ id: ulid(now().getTime()), userId, ...n, readAt: null, createdAt: at });
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.deletedAt) return;
  const p = prefsOf(userId).categories[category];
  if (p.email) db.outbox.unshift({ id: ulid(now().getTime()), to: user.email, subject: n.title, body: n.body, link: n.link, createdAt: at, channel: 'EMAIL' });
  const phone = prefsOf(userId).phone;
  if (!phone) return;
  const short = `Webinger Collab: ${n.title}${n.link ? ` — open the app: ${n.link}` : ''}`;
  if (p.sms) db.outbox.unshift({ id: ulid(now().getTime()), to: phone, subject: n.title, body: short, link: n.link, createdAt: at, channel: 'SMS' });
  if (p.whatsapp) db.outbox.unshift({ id: ulid(now().getTime()), to: phone, subject: n.title, body: `*${n.title}*\n${n.body}`, link: n.link, createdAt: at, channel: 'WHATSAPP' });
}
