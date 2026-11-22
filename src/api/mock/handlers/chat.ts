/**
 * Mock for Chat (FR-50, FR-51) and Notifications (FR-52), plus the polling stand-in for STOMP.
 * Contact details are masked before a message is stored while the order is not completed.
 */
import { inquiryInputSchema, markReadSchema, maskContacts, messageInputSchema } from '@/features/chat/schemas';
import { INQUIRY_WINDOW_DAYS, PLANS } from '@/lib/plans';
import type { AppNotification, ChatMessage, Conversation, ConversationList, InquiryAllowance, MessageList, NotificationPage } from '@/types';
import { deliver } from '../deliver';
import { getDb, now, ulid, type ConversationRow, type MessageRow, type NotificationRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';

/* ---------- Helpers ---------- */

/** Order conversations take their sides from the order; inquiries (v3.0) store them. */
function participants(conv: ConversationRow) {
  if (conv.orderId === null) return { order: null, brandId: conv.brandUserId!, creatorId: conv.creatorUserId! };
  const o = getDb().orders.find((x) => x.id === conv.orderId)!;
  return { order: o, brandId: o.brandUserId, creatorId: o.creatorUserId };
}

function myConversation(user: UserRow, id: string): ConversationRow {
  const c = getDb().conversations.find((x) => x.id === id);
  if (!c) fail(404, 'No such conversation.', 'CONVERSATION_NOT_FOUND');
  const p = participants(c);
  if (user.role !== 'ADMIN' && user.id !== p.brandId && user.id !== p.creatorId) fail(404, 'No such conversation.', 'CONVERSATION_NOT_FOUND');
  return c;
}

/** FR-51: hidden until the order is completed; always hidden in inquiries (no order yet). */
const contactsHidden = (c: ConversationRow) => participants(c).order?.status !== 'COMPLETED';

function senderName(userId: string) {
  const db = getDb();
  const creator = db.creatorProfiles.find((p) => p.userId === userId);
  if (creator) return creator.displayName;
  const brand = db.brandProfiles.find((b) => b.userId === userId);
  return brand?.companyName ?? db.users.find((u) => u.id === userId)?.name ?? 'Someone';
}

const toMessage = (m: MessageRow, viewer: UserRow): ChatMessage => ({
  id: m.id,
  conversationId: m.conversationId,
  mine: m.senderUserId === viewer.id,
  senderName: senderName(m.senderUserId),
  body: m.body,
  masked: m.masked,
  attachment: m.attachment ?? null,
  createdAt: m.createdAt,
  readAt: m.readAt,
});

const unreadFor = (c: ConversationRow, viewer: UserRow) => getDb().messages.filter((m) => m.conversationId === c.id && m.senderUserId !== viewer.id && !m.readAt).length;

function toConversation(c: ConversationRow, viewer: UserRow): Conversation {
  const db = getDb();
  const { order, brandId, creatorId } = participants(c);
  const info = order ? db.orderInfo.find((i) => i.orderId === order.id) : null;
  const msgs = db.messages.filter((m) => m.conversationId === c.id);
  const last = msgs[msgs.length - 1];
  const otherId = viewer.id === brandId ? creatorId : brandId;
  const creator = db.creatorProfiles.find((p) => p.userId === otherId);
  const brand = db.brandProfiles.find((b) => b.userId === otherId);
  return {
    id: c.id,
    kind: order ? 'ORDER' : 'INQUIRY',
    orderId: order?.id ?? null,
    orderTitle: info?.title ?? 'Before booking',
    orderStatus: order?.status ?? null,
    counterparty: creator ? { name: creator.displayName, photoUrl: creator.photoUrl, username: creator.username } : { name: brand?.companyName ?? senderName(otherId), photoUrl: brand?.logoUrl ?? null, username: null },
    lastMessage: last ? toMessage(last, viewer) : null,
    unreadCount: unreadFor(c, viewer),
    contactsHidden: contactsHidden(c),
    updatedAt: last?.createdAt ?? c.createdAt,
  };
}

function myConversations(user: UserRow) {
  const db = getDb();
  const orderIds = new Set(db.orders.filter((o) => user.role === 'ADMIN' || o.brandUserId === user.id || o.creatorUserId === user.id).map((o) => o.id));
  return db.conversations.filter((c) => (c.orderId === null ? user.role === 'ADMIN' || c.brandUserId === user.id || c.creatorUserId === user.id : orderIds.has(c.orderId)));
}

/* ---------- Pre-booking inquiries (v3.0) ---------- */

const DAY = 86_400_000;

/** New inquiries the brand started in the rolling window, against its plan's limit. */
export function inquiryAllowance(user: UserRow): InquiryAllowance {
  const db = getDb();
  const plan = db.brandProfiles.find((b) => b.userId === user.id)?.plan ?? 'FREE';
  const since = new Date(now().getTime() - INQUIRY_WINDOW_DAYS * DAY).toISOString();
  const counted = db.conversations.filter((c) => c.orderId === null && c.brandUserId === user.id && c.createdAt >= since).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    plan,
    used: counted.length,
    limit: PLANS[plan].inquiryLimit,
    resetsAt: counted.length ? new Date(new Date(counted[0].createdAt).getTime() + INQUIRY_WINDOW_DAYS * DAY).toISOString() : null,
  };
}

/** The brand's inquiry with a creator, if any (shown on the creator's profile). */
export const inquiryBetween = (brandUserId: string, creatorUserId: string) =>
  getDb().conversations.find((c) => c.orderId === null && c.brandUserId === brandUserId && c.creatorUserId === creatorUserId) ?? null;

function storeMessage(c: ConversationRow, user: UserRow, body: string, attachment: MessageRow['attachment'] = null): MessageRow {
  // FR-51: hide contact details before storing, until the order is completed.
  const m = contactsHidden(c) ? maskContacts(body) : { text: body, masked: false };
  const row: MessageRow = { id: ulid(now().getTime()), conversationId: c.id, senderUserId: user.id, body: m.text, masked: m.masked, attachment: attachment ?? null, createdAt: now().toISOString(), readAt: null };
  getDb().messages.push(row);
  return row;
}

export const getInquiryAllowance: Handler = ({ user }) => {
  if (user.role !== 'BRAND') fail(403, 'Only brands start inquiries.', 'ROLE_NOT_ALLOWED');
  return ok(inquiryAllowance(user));
};

export const startInquiry: Handler = ({ req, user }) => {
  if (user.role !== 'BRAND') fail(403, 'Only brands can message creators before booking.', 'ROLE_NOT_ALLOWED');
  if (!user.emailVerifiedAt) fail(403, 'Verify your email before messaging creators.', 'EMAIL_NOT_VERIFIED');
  const body = parseBody(inquiryInputSchema, req.body);
  const db = getDb();
  const p = db.creatorProfiles.find((c) => c.username?.toLowerCase() === body.creatorUsername.toLowerCase());
  const owner = p && db.users.find((u) => u.id === p.userId);
  if (!p || p.vettingStatus !== 'APPROVED' || owner?.status !== 'ACTIVE') fail(404, 'No creator with that username.', 'CREATOR_NOT_FOUND');
  let c = inquiryBetween(user.id, p.userId);
  const isNew = !c;
  if (!c) {
    const a = inquiryAllowance(user);
    if (a.limit !== null && a.used >= a.limit)
      fail(429, `Your ${PLANS[a.plan].name} plan includes ${a.limit} new conversations every ${INQUIRY_WINDOW_DAYS} days. Upgrade your plan, or book the creator directly.`, 'INQUIRY_LIMIT');
    c = { id: ulid(now().getTime()), orderId: null, brandUserId: user.id, creatorUserId: p.userId, createdAt: now().toISOString() };
    db.conversations.push(c);
  }
  storeMessage(c, user, body.body);
  if (isNew) {
    const brand = db.brandProfiles.find((b) => b.userId === user.id)?.companyName ?? user.name;
    deliver(p.userId, { type: 'NEW_INQUIRY', title: `${brand} wants to talk before booking`, body: body.body.length > 120 ? `${body.body.slice(0, 117)}…` : body.body, link: `/messages/${c.id}` }, 'ORDERS');
  }
  return ok(toConversation(c, user), 201);
};

/* ---------- Chat ---------- */

export const listConversations: Handler = ({ user }) => {
  const list = myConversations(user).map((c) => toConversation(c, user));
  // Conversations with messages first (newest activity), then the rest by order date.
  list.sort((a, b) => Number(!!b.lastMessage) - Number(!!a.lastMessage) || b.updatedAt.localeCompare(a.updatedAt));
  const body: ConversationList = { content: list, unreadTotal: list.reduce((s, c) => s + c.unreadCount, 0) };
  return ok(body);
};

export const listMessages: Handler = ({ req, params, user }) => {
  const c = myConversation(user, params.id);
  const all = getDb().messages.filter((m) => m.conversationId === c.id);
  const after = req.query.get('after');
  const from = after ? all.findIndex((m) => m.id === after) + 1 : 0;
  const body: MessageList = { messages: all.slice(from).map((m) => toMessage(m, user)), contactsHidden: contactsHidden(c), serverTime: now().toISOString() };
  return ok(body);
};

export const sendMessage: Handler = ({ req, params, user }) => {
  const c = myConversation(user, params.id);
  if (user.role === 'ADMIN') fail(403, 'Admins can read but not post in order chats.', 'ROLE_NOT_ALLOWED');
  const { body, attachment } = parseBody(messageInputSchema, req.body);
  return ok(toMessage(storeMessage(c, user, body, attachment), user), 201);
};

export const markConversationRead: Handler = ({ params, user }) => {
  const c = myConversation(user, params.id);
  const at = now().toISOString();
  for (const m of getDb().messages) if (m.conversationId === c.id && m.senderUserId !== user.id && !m.readAt) m.readAt = at;
  return { status: 204 };
};

/* ---------- Notifications (FR-52) ---------- */

const toNotification = (n: NotificationRow): AppNotification => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.readAt, createdAt: n.createdAt });

export const listNotifications: Handler = ({ req, user }) => {
  const mine = getDb()
    .notifications.filter((n) => n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unreadOnly = req.query.get('unreadOnly') === 'true';
  const rows = unreadOnly ? mine.filter((n) => !n.readAt) : mine;
  const page = Math.max(0, Number(req.query.get('page') ?? 0) || 0);
  const size = Math.min(50, Math.max(1, Number(req.query.get('size') ?? 20) || 20));
  const body: NotificationPage = {
    content: rows.slice(page * size, (page + 1) * size).map(toNotification),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / size),
    unreadCount: mine.filter((n) => !n.readAt).length,
  };
  return ok(body);
};

export const markNotificationsRead: Handler = ({ req, user }) => {
  const body = parseBody(markReadSchema, req.body);
  const ids = new Set(body.ids ?? []);
  const at = now().toISOString();
  for (const n of getDb().notifications) if (n.userId === user.id && !n.readAt && (body.all || ids.has(n.id))) n.readAt = at;
  return { status: 204 };
};

/* ---------- Mock-only: STOMP stand-in ---------- */

/**
 * GET /dev/realtime/poll?since=ISO — what the STOMP broker would have pushed to this user since `since`:
 * events on /user/queue/messages (new messages from others) and /user/queue/notifications.
 */
export const pollRealtime: Handler = ({ req, user }) => {
  const since = req.query.get('since') ?? now().toISOString();
  const db = getDb();
  const convIds = new Set(myConversations(user).map((c) => c.id));
  const events = [
    ...db.messages
      .filter((m) => convIds.has(m.conversationId) && m.senderUserId !== user.id && m.createdAt > since)
      .map((m) => ({ topic: '/user/queue/messages', at: m.createdAt, payload: toMessage(m, user) })),
    ...db.notifications.filter((n) => n.userId === user.id && n.createdAt > since).map((n) => ({ topic: '/user/queue/notifications', at: n.createdAt, payload: toNotification(n) })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return ok({ events, serverTime: now().toISOString() });
};
