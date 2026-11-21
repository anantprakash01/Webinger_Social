/**
 * FR-52: an in-app notification (and an email) for every order state change, to each participant who
 * did not cause it. System events (expiry, auto-approval) go to both sides. Pure, so the seed and the
 * live mock produce identical wording; the backend sends the same events through Spring events.
 */
import { formatMoney } from '@/lib/money';
import { brandTotalCents, creatorPayoutCents, type MockOrder, type OrderEvent } from './orderMachine';

export interface NotificationDraft {
  userId: string;
  type: 'ORDER_EVENT' | 'NEW_APPLICATION' | 'APPLICATION_ACCEPTED' | 'APPLICATION_REJECTED';
  title: string;
  body: string;
  link: string | null;
}

export interface OrderNames {
  title: string;
  brandName: string;
  creatorName: string;
}

const first = (name: string) => name.split(' ')[0];

export function orderEventNotifications(e: OrderEvent, o: MockOrder, n: OrderNames): NotificationDraft[] {
  const payout = formatMoney(creatorPayoutCents(o), o.currency);
  const total = formatMoney(brandTotalCents(o), o.currency);
  const toBrand = (title: string, body: string): NotificationDraft => ({ userId: o.brandUserId, type: 'ORDER_EVENT', title, body, link: `/brand/orders/${o.id}` });
  const toCreator = (title: string, body: string): NotificationDraft => ({ userId: o.creatorUserId, type: 'ORDER_EVENT', title, body, link: `/creator/orders/${o.id}` });
  const byBrand = e.actorId === o.brandUserId;

  switch (e.type) {
    case 'CREATE':
      return [toCreator(`New order from ${n.brandName}`, `“${n.title}” — you receive ${payout}. Accept within 72 hours.`)];
    case 'ACCEPT':
      return [toBrand(`${first(n.creatorName)} accepted your order`, `“${n.title}” is in progress. ${total} was charged and is held in escrow.`)];
    case 'DECLINE':
      return [toBrand(`${first(n.creatorName)} declined your order`, `“${n.title}” — the card hold was released and you were not charged.`)];
    case 'CANCEL':
      return byBrand
        ? [toCreator(`${n.brandName} cancelled an order`, `“${n.title}” was cancelled before you accepted it.`)]
        : [toBrand(`${first(n.creatorName)} cancelled your order`, `“${n.title}” — the card hold was released and you were not charged.`)];
    case 'EXPIRE':
      return [
        toBrand('Order expired', `${first(n.creatorName)} didn't accept “${n.title}” within 72 hours. The card hold was released.`),
        toCreator('Order expired', `You didn't accept “${n.title}” within 72 hours, so it was closed.`),
      ];
    case 'DELIVER':
      return [toBrand(`${first(n.creatorName)} delivered “${n.title}”`, 'Review it within 72 hours: approve, ask for a revision, or open a dispute.')];
    case 'REQUEST_REVISION':
      return [toCreator('Revision requested', `${n.brandName} asked for changes to “${n.title}”${e.note ? `: “${e.note}”` : '.'}`)];
    case 'APPROVE':
      return [toCreator(`${n.brandName} approved your work`, `“${n.title}” is complete. ${payout} was added to your balance.`)];
    case 'AUTO_APPROVE':
      return [
        toBrand('Delivery approved automatically', `“${n.title}” was approved after 72 hours without a review.`),
        toCreator('Approved automatically', `“${n.title}” is complete. ${payout} was added to your balance.`),
      ];
    case 'DISPUTE':
      return [toCreator('A dispute was opened', `${n.brandName} disputed “${n.title}”. Our team will review it; the money stays in escrow.`)];
    case 'ADMIN_RELEASE':
      return [toBrand('Dispute resolved', `“${n.title}”: the payment was released to the creator.`), toCreator('Dispute resolved in your favour', `${payout} was added to your balance.`)];
    case 'ADMIN_REFUND': {
      const refund = formatMoney(o.payment.refundedCents, o.currency);
      return [toBrand('Dispute resolved — refund', `${refund} was refunded for “${n.title}”.`), toCreator('Dispute resolved', `${refund} was refunded to the brand for “${n.title}”.`)];
    }
    case 'ADMIN_CANCEL': {
      const refund = formatMoney(o.payment.refundedCents, o.currency);
      return [toBrand('Order cancelled by our team', `“${n.title}” was cancelled and ${refund} refunded to your payment method.`), toCreator('Order cancelled by our team', `“${n.title}” was cancelled by our team and the brand was refunded.`)];
    }
  }
}
