/** Wording and time helpers for orders. Money goes through lib/money only. */
import { formatMoney } from '@/lib/money';
import type { OrderDetail, OrderEventView, OrderStatusApi, OrderSummary, Role } from '@/types';

/**
 * Countdowns use the server's clock (`serverTime`), not the device's, so they agree with the deadlines
 * the server enforces — including the mock's "Simulate time".
 */
export function serverNow(serverTime: string, fetchedAt: number, deviceNow = Date.now()) {
  return new Date(serverTime).getTime() + (deviceNow - fetchedAt);
}

/** "2 d 5 h", "4 h 10 min", "12 min". */
export function formatSpan(ms: number): string {
  const mins = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d${h ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${Math.max(1, m)} min`;
}

export function countdown(at: string, nowMs: number): { text: string; overdue: boolean; urgent: boolean } {
  const diff = new Date(at).getTime() - nowMs;
  return diff >= 0 ? { text: `${formatSpan(diff)} left`, overdue: false, urgent: diff < 24 * 3_600_000 } : { text: `${formatSpan(diff)} overdue`, overdue: true, urgent: true };
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const shortId = (id: string) => `#${id.slice(-6)}`;

export const DEADLINE_LABEL = { ACCEPT: 'Accept by', DUE: 'Due', REVIEW: 'Review by' } as const;

/** One line for the timeline (FR-52 later sends the same events as notifications). */
export function eventLabel(e: OrderEventView, o: Pick<OrderDetail, 'money' | 'counterparty' | 'payment'>): string {
  const m = o.money;
  switch (e.type) {
    case 'CREATE':
      return `Order placed — ${formatMoney(m.totalCents, m.currency)} held (${o.payment.methodLabel}), not charged`;
    case 'ACCEPT':
      return `Accepted — payment captured, ${formatMoney(m.totalCents, m.currency)} held in escrow`;
    case 'DECLINE':
      return 'Declined by the creator — payment hold released';
    case 'CANCEL':
      return `Cancelled by the ${e.actor === 'BRAND' ? 'brand' : 'creator'} — payment hold released`;
    case 'EXPIRE':
      return 'Expired — not accepted within 72 hours, payment hold released';
    case 'DELIVER':
      return e.fromStatus === 'IN_PROGRESS' ? 'Delivered for review' : 'Delivered';
    case 'REQUEST_REVISION':
      return 'Revision requested';
    case 'APPROVE':
      return `Approved — ${formatMoney(m.creatorPayoutCents, m.currency)} released to the creator`;
    case 'AUTO_APPROVE':
      return `Approved automatically after 72 hours — ${formatMoney(m.creatorPayoutCents, m.currency)} released to the creator`;
    case 'DISPUTE':
      return 'Dispute opened — money stays in escrow';
    case 'ADMIN_RELEASE':
      return 'Dispute resolved — payment released to the creator';
    case 'ADMIN_CANCEL':
      return `Cancelled by our team — ${formatMoney(o.payment.refundedCents, m.currency)} refunded to the brand`;
    case 'ADMIN_REFUND':
      return `Dispute resolved — ${formatMoney(o.payment.refundedCents, m.currency)} refunded to the brand`;
  }
}

/** Plain-language payment state for the payment card (FR-64). */
export function paymentText(o: Pick<OrderDetail, 'payment' | 'money' | 'status'>, role: Role): string {
  const m = o.money;
  switch (o.payment.status) {
    case 'AUTHORIZED':
      return role === 'BRAND' ? `Held on ${o.payment.methodLabel} — you are charged only if the creator accepts.` : 'The brand’s payment is held and is captured when you accept.';
    case 'CAPTURED':
      if (o.status === 'COMPLETED') return role === 'BRAND' ? 'Paid. The creator has been paid.' : `${formatMoney(m.creatorPayoutCents, m.currency)} added to your balance.`;
      return 'Charged and held in escrow until the work is approved.';
    case 'REFUNDED':
      return `${formatMoney(o.payment.refundedCents, m.currency)} refunded to the brand.`;
    case 'CANCELED':
      return role === 'BRAND' ? 'Payment hold released — you were not charged.' : 'Payment hold released — no payment was taken.';
  }
}

export const STATUS_FILTERS: Array<{ key: string; label: string; statuses: OrderStatusApi[] }> = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'pending', label: 'Awaiting acceptance', statuses: ['PENDING_ACCEPTANCE'] },
  { key: 'in-progress', label: 'In progress', statuses: ['IN_PROGRESS'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'disputed', label: 'Disputed', statuses: ['DISPUTED'] },
  { key: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
  { key: 'closed', label: 'Closed & refunded', statuses: ['CLOSED', 'REFUNDED'] },
];

/** The amount that matters to the viewer: the brand pays the total, the creator receives the payout. */
export const viewerAmount = (o: Pick<OrderSummary, 'money'>, role: Role) => (role === 'CREATOR' ? o.money.creatorPayoutCents : o.money.totalCents);
