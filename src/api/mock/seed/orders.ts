/**
 * Seeded orders in every state (section 9.5 rule 4), between the demo brand (Saltbay Supply Co.)
 * and the demo creator Leo plus a few invented creators. Every order is built by running the real
 * state machine with back-dated clocks, so events, payment states and ledger entries are exactly
 * what production would have written. Deadlines are relative to `now`, so some expire or
 * auto-approve soon — handy for "Simulate time".
 */
import { DEFAULT_FEES } from '../fees';
import type { LedgerEntry } from '../ledger';
import { brandTotalCents, createOrder, transition, type Actor, type MockOrder, type OrderEvent, type OrderEventInput } from '../orderMachine';
import type { DeliveryRow, DisputeRow, OrderBriefRow, OrderInfoRow, PackageRow, ReviewRow } from '../db';
import { prng, type SeedResult } from './creators';

const HOUR = 3_600_000;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_EPOCH = Date.UTC(2026, 10, 1);

export interface OrderSeedResult {
  orders: MockOrder[];
  orderEvents: OrderEvent[];
  ledgerEntries: LedgerEntry[];
  orderInfo: OrderInfoRow[];
  orderBriefs: OrderBriefRow[];
  deliveries: DeliveryRow[];
  disputes: DisputeRow[];
  reviews: ReviewRow[];
}

type Step = [OrderEventInput, 'BRAND' | 'CREATOR' | 'ADMIN' | 'SYSTEM', number]; // event, who, hours ago

interface Scenario {
  creatorId: string;
  /** Index into the creator's active packages, or a custom offer. */
  pkg: number | { title: string; platform: PackageRow['platform']; deliverables: string[]; priceCents: number; deliveryDays: number };
  placedHoursAgo: number;
  steps: Step[];
  requirements: string;
  review?: { rating: number; comment: string; reply?: string };
}

export function seedOrders(now: Date, ids: { brandId: string; brandName: string; leoId: string; adminId: string }, creators: SeedResult): OrderSeedResult {
  const r = prng(4242);
  const out: OrderSeedResult = { orders: [], orderEvents: [], ledgerEntries: [], orderInfo: [], orderBriefs: [], deliveries: [], disputes: [], reviews: [] };
  const id = (hoursAgo: number) => {
    let t = SEED_EPOCH - Math.round(hoursAgo) * HOUR;
    let head = '';
    for (let i = 0; i < 10; i++) {
      head = CROCKFORD[t % 32] + head;
      t = Math.floor(t / 32);
    }
    let tail = '';
    for (let i = 0; i < 16; i++) tail += CROCKFORD[Math.floor(r() * 32)];
    return head + tail;
  };
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR);
  const actors = (creatorId: string): Record<Step[1], Actor> => ({
    BRAND: { kind: 'USER', userId: ids.brandId, role: 'BRAND', emailVerified: true },
    CREATOR: { kind: 'USER', userId: creatorId, role: 'CREATOR', emailVerified: true },
    ADMIN: { kind: 'USER', userId: ids.adminId, role: 'ADMIN', emailVerified: true },
    SYSTEM: { kind: 'SYSTEM' },
  });

  // A few approved invented creators with packages, chosen deterministically.
  const others = creators.creatorProfiles
    .filter((p) => p.vettingStatus === 'APPROVED' && p.userId !== ids.leoId)
    .filter((p) => creators.packages.some((k) => k.creatorId === p.userId && k.active))
    .slice(0, 8)
    .map((p) => p.userId);
  const [c1, c2, c3, c4, c5, c6, c7] = others;
  const leo = ids.leoId;

  const scenarios: Scenario[] = [
    // Waiting for Leo to accept (one fresh, one about to expire).
    { creatorId: leo, pkg: 0, placedHoursAgo: 5, steps: [], requirements: 'Show our new linen tote in a morning routine. Natural light, no music with lyrics.' },
    { creatorId: leo, pkg: 1, placedHoursAgo: 70, steps: [], requirements: 'Quick unboxing of the ceramic pour-over set. Mention the 30-day returns.' },
    // In progress: a custom offer with Leo, and a late one elsewhere.
    {
      creatorId: leo,
      pkg: { title: 'Desk setup feature (custom)', platform: 'YOUTUBE', deliverables: ['60–90 s integration', 'Link in description', 'Pinned comment'], priceCents: 3_600_000, deliveryDays: 7 },
      placedHoursAgo: 60,
      steps: [[{ type: 'ACCEPT' }, 'CREATOR', 48]],
      requirements: 'Feature our walnut monitor stand in your next desk tour. Talking points attached.',
    },
    { creatorId: c1, pkg: 0, placedHoursAgo: 240, steps: [[{ type: 'ACCEPT' }, 'CREATOR', 230]], requirements: 'Lifestyle shot of the picnic blanket at a park. Two angles please.' },
    // Delivered: brand to review now, and one that auto-approves soon.
    {
      creatorId: leo,
      pkg: 0,
      placedHoursAgo: 150,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 140],
        [{ type: 'DELIVER' }, 'CREATOR', 20],
      ],
      requirements: 'A Reel showing the travel mug keeping coffee hot on a commute. Tag @saltbay.',
    },
    {
      creatorId: c2,
      pkg: 0,
      placedHoursAgo: 200,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 190],
        [{ type: 'DELIVER' }, 'CREATOR', 70],
      ],
      requirements: 'Unboxing of the beach towel set, focus on texture and colours.',
    },
    // Completed: Leo without a review yet (brand can review), another with review and reply.
    {
      creatorId: leo,
      pkg: 0,
      placedHoursAgo: 600,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 590],
        [{ type: 'DELIVER' }, 'CREATOR', 500],
        [{ type: 'APPROVE' }, 'BRAND', 480],
      ],
      requirements: 'Spring launch Reel for the cotton throw blanket.',
    },
    {
      creatorId: c3,
      pkg: 0,
      placedHoursAgo: 900,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 880],
        [{ type: 'DELIVER' }, 'CREATOR', 800],
        [{ type: 'REQUEST_REVISION', note: 'Could you show the label more clearly in the first 3 seconds?' }, 'BRAND', 790],
        [{ type: 'DELIVER' }, 'CREATOR', 760],
        [{ type: 'APPROVE' }, 'BRAND', 750],
      ],
      requirements: 'Holiday gift guide feature for the candle trio.',
      review: { rating: 5, comment: 'Great communication and the revision was quick. Booking again.', reply: 'Thank you, it was a pleasure!' },
    },
    // Disputed, and a dispute refunded in part.
    {
      creatorId: c4,
      pkg: 0,
      placedHoursAgo: 300,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 290],
        [{ type: 'DELIVER' }, 'CREATOR', 40],
        [{ type: 'DISPUTE', note: 'The video shows a competitor’s product next to ours for most of the clip.' }, 'BRAND', 30],
      ],
      requirements: 'Solo product video for the enamel mugs. No other brands visible.',
    },
    {
      creatorId: c5,
      pkg: 0,
      placedHoursAgo: 1000,
      steps: [
        [{ type: 'ACCEPT' }, 'CREATOR', 990],
        [{ type: 'DELIVER' }, 'CREATOR', 900],
        [{ type: 'DISPUTE', note: 'Only one of the two agreed posts went live.' }, 'BRAND', 890],
        [{ type: 'ADMIN_REFUND', refundCents: -1, note: 'Half the deliverables were posted; partial refund.' }, 'ADMIN', 850],
      ],
      requirements: 'Two posts featuring the hammock: one feed post, one Reel.',
    },
    // Closed: declined by Leo, expired, cancelled by the brand.
    { creatorId: leo, pkg: 0, placedHoursAgo: 400, steps: [[{ type: 'DECLINE', note: 'Fully booked that month, sorry!' }, 'CREATOR', 390]], requirements: 'Back-to-school desk organiser feature.' },
    { creatorId: c6, pkg: 0, placedHoursAgo: 500, steps: [[{ type: 'EXPIRE' }, 'SYSTEM', 428]], requirements: 'Summer picnic set Reel.' },
    { creatorId: c7, pkg: 0, placedHoursAgo: 120, steps: [[{ type: 'CANCEL', note: 'Campaign postponed.' }, 'BRAND', 118]], requirements: 'Autumn throw pillow unboxing.' },
  ];

  for (const s of scenarios) {
    const pkgs = creators.packages.filter((k) => k.creatorId === s.creatorId && k.active).sort((a, b) => a.priceCents - b.priceCents);
    const fromPkg = typeof s.pkg === 'number' ? pkgs[Math.min(s.pkg, pkgs.length - 1)] : null;
    const line = fromPkg ?? (s.pkg as Exclude<Scenario['pkg'], number>);
    const orderId = id(s.placedHoursAgo);
    const who = actors(s.creatorId);

    const created = createOrder(
      { id: orderId, creatorUserId: s.creatorId, packageId: fromPkg?.id ?? null, priceCents: line.priceCents, deliveryDays: line.deliveryDays, fees: DEFAULT_FEES },
      who.BRAND,
      { now: at(s.placedHoursAgo) },
    );
    let order = created.order;
    out.orderEvents.push(created.event);
    out.orderInfo.push({
      orderId,
      kind: fromPkg ? 'PACKAGE' : 'CUSTOM_OFFER',
      title: line.title,
      platform: line.platform,
      deliverables: line.deliverables,
      paymentIntentId: `pi_mock${orderId.slice(-10).toLowerCase()}`,
    });
    out.orderBriefs.push({ orderId, requirements: s.requirements, needsShipping: true, shippingAddress: null, links: ['https://saltbay.example.com/press-kit'], referenceFiles: [], updatedAt: order.createdAt });

    let revisionNo = 0;
    for (const [e, role, hoursAgo] of s.steps) {
      const event = e.type === 'ADMIN_REFUND' && e.refundCents < 0 ? { ...e, refundCents: Math.floor((order.priceCents - order.creatorFeeCents) / 2) } : e;
      const res = transition(order, event, who[role], { now: at(hoursAgo), newId: () => id(hoursAgo) });
      order = res.order;
      out.orderEvents.push(res.event);
      out.ledgerEntries.push(...res.ledger);
      if (e.type === 'DELIVER') {
        out.deliveries.push({
          id: id(hoursAgo),
          orderId,
          revisionNo,
          items: [
            { type: 'POST_URL', url: `https://example.com/demo-post/${orderId.slice(-8).toLowerCase()}-${revisionNo}`, name: 'Live post' },
            { type: 'FILE', url: `/demo/work-${String(1 + Math.floor(r() * 36)).padStart(2, '0')}.svg`, name: 'Cover frame' },
          ],
          note: revisionNo ? 'Updated as requested.' : 'Here it is — happy to tweak anything.',
          submittedAt: at(hoursAgo).toISOString(),
        });
        revisionNo += 1;
      }
      if (e.type === 'DISPUTE') {
        out.disputes.push({ id: id(hoursAgo), orderId, openedBy: ids.brandId, reason: e.note ?? '', status: 'OPEN', resolution: null, refundCents: null, resolvedBy: null, createdAt: at(hoursAgo).toISOString(), resolvedAt: null });
      }
      if (e.type === 'ADMIN_REFUND' || e.type === 'ADMIN_RELEASE') {
        const d = out.disputes.find((x) => x.orderId === orderId)!;
        const refund = 'refundCents' in event ? event.refundCents : 0;
        Object.assign(d, {
          status: 'RESOLVED',
          resolution: e.type === 'ADMIN_RELEASE' ? 'RELEASE' : refund === brandTotalCents(order) ? 'FULL_REFUND' : 'PARTIAL_REFUND',
          refundCents: e.type === 'ADMIN_RELEASE' ? 0 : refund,
          resolvedBy: ids.adminId,
          resolvedAt: at(hoursAgo).toISOString(),
        });
      }
    }
    out.orders.push(order);

    if (s.review) {
      const createdAt = at(Math.max(1, s.steps[s.steps.length - 1][2] - 2)).toISOString();
      out.reviews.push({
        id: id(s.placedHoursAgo - 1),
        orderId,
        creatorId: s.creatorId,
        brandUserId: ids.brandId,
        brandName: ids.brandName,
        rating: s.review.rating,
        comment: s.review.comment,
        creatorReply: s.review.reply ?? null,
        repliedAt: s.review.reply ? createdAt : null,
        createdAt,
      });
    }
  }
  return out;
}
