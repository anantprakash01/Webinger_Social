/** Mock for the brand workspace: company profile (FR-05). Brand role only. */
import { brandProfileInputSchema } from '@/features/brands/schemas';
import type { BrandProfile, BrandStats } from '@/types';
import { getDb, now, type BrandProfileRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';

function myBrand(user: UserRow): BrandProfileRow {
  if (user.role !== 'BRAND') fail(403, 'Only brand accounts have a company profile.', 'ROLE_NOT_ALLOWED');
  const b = getDb().brandProfiles.find((x) => x.userId === user.id);
  if (!b) fail(404, 'Brand profile not found.', 'NOT_FOUND');
  return b;
}

const toBrandProfile = (b: BrandProfileRow): BrandProfile => ({
  companyName: b.companyName,
  website: b.website,
  logoUrl: b.logoUrl,
  industry: b.industry,
  country: b.country,
  plan: b.plan,
});

export const getMyBrandProfile: Handler = ({ user }) => ok(toBrandProfile(myBrand(user)));

export const updateMyBrandProfile: Handler = ({ req, user }) => {
  const b = myBrand(user);
  const body = parseBody(brandProfileInputSchema, req.body);
  Object.assign(b, {
    companyName: body.companyName,
    website: body.website ?? null,
    logoUrl: body.logoUrl ?? null,
    industry: body.industry,
    country: body.country,
  });
  user.updatedAt = now().toISOString();
  return ok(toBrandProfile(b));
};

/**
 * v1.1: charges by the month the card was captured (the ACCEPT event) minus refunds by the month of the
 * refund, for the last 6 calendar months (UTC), oldest first.
 */
function spendByMonth(charges: Array<{ orderId: string; cents: number }>, orders: Array<{ id: string; payment: { refundedCents: number } }>) {
  const db = getDb();
  const t = now();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  const sums = new Map(months.map((m) => [m, 0]));
  const add = (iso: string | undefined, cents: number) => {
    const m = iso?.slice(0, 7);
    if (m && sums.has(m)) sums.set(m, sums.get(m)! + cents);
  };
  for (const c of charges) add(db.orderEvents.find((e) => e.orderId === c.orderId && e.type === 'ACCEPT')?.at, c.cents);
  for (const o of orders) if (o.payment.refundedCents > 0) add(db.orderEvents.find((e) => e.orderId === o.id && e.type === 'ADMIN_REFUND')?.at, -o.payment.refundedCents);
  return months.map((month) => ({ month, cents: sums.get(month)! }));
}

/** FR-71: spend, orders by status, delivered post links. */
export const getMyBrandStats: Handler = ({ user }) => {
  myBrand(user);
  const db = getDb();
  const orders = db.orders.filter((o) => o.brandUserId === user.id);
  const total = (o: (typeof orders)[number]) => o.priceCents + o.brandFeeCents;
  const captured = orders.filter((o) => o.payment.status === 'CAPTURED' || o.payment.status === 'REFUNDED');
  const statuses = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CLOSED'] as const;
  const ids = new Set(orders.map((o) => o.id));
  const campaigns = db.campaigns.filter((c) => c.brandUserId === user.id);
  const today = now().toISOString().slice(0, 10);
  const body: BrandStats = {
    currency: 'INR',
    spentCents: captured.reduce((s, o) => s + total(o) - o.payment.refundedCents, 0),
    inEscrowCents: orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'DELIVERED' || o.status === 'DISPUTED').reduce((s, o) => s + total(o), 0),
    authorisedCents: orders.filter((o) => o.status === 'PENDING_ACCEPTANCE').reduce((s, o) => s + total(o), 0),
    ordersByStatus: Object.fromEntries(statuses.map((s) => [s, orders.filter((o) => o.status === s).length])),
    deliveredPosts: db.deliveries
      .filter((d) => ids.has(d.orderId))
      .flatMap((d) =>
        d.items
          .filter((i) => i.type === 'POST_URL')
          .map((i) => {
            const o = orders.find((x) => x.id === d.orderId)!;
            return {
              orderId: d.orderId,
              orderTitle: db.orderInfo.find((x) => x.orderId === d.orderId)?.title ?? 'Order',
              creatorName: db.creatorProfiles.find((p) => p.userId === o.creatorUserId)?.displayName ?? 'Creator',
              url: i.url,
              deliveredAt: d.submittedAt,
            };
          }),
      )
      .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))
      .slice(0, 20),
    openCampaigns: campaigns.filter((c) => c.status === 'OPEN' && c.deadline >= today).length,
    pendingApplications: db.applications.filter((a) => a.status === 'PENDING' && campaigns.some((c) => c.id === a.campaignId)).length,
    spendByMonth: spendByMonth(captured.map((o) => ({ orderId: o.id, cents: total(o) })), orders),
  };
  return ok(body);
};
