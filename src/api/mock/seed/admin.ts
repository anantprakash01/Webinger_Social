/**
 * Week 6 seed: the audit log for every seeded money movement and the seeded dispute resolution (FR-84),
 * and a few reports for the admin queue (FR-85). Invented content only.
 */
import { formatMoney } from '@/lib/money';
import type { AuditRow, ReportRow } from '../db';
import { prng, type SeedResult } from './creators';
import type { EngagementSeed } from './engagement';
import type { OrderSeedResult } from './orders';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_EPOCH = Date.UTC(2026, 10, 3);
const HOUR = 3_600_000;

export function seedAdmin(
  now: Date,
  ids: { brandId: string; leoId: string; adminId: string },
  creators: SeedResult,
  orders: OrderSeedResult,
  engagement: EngagementSeed,
): { auditLogs: AuditRow[]; reports: ReportRow[] } {
  const r = prng(6060);
  const id = (h = 0) => {
    let t = SEED_EPOCH - Math.round(h) * HOUR;
    let head = '';
    for (let i = 0; i < 10; i++) {
      head = CROCKFORD[t % 32] + head;
      t = Math.floor(t / 32);
    }
    let tail = '';
    for (let i = 0; i < 16; i++) tail += CROCKFORD[Math.floor(r() * 32)];
    return head + tail;
  };
  const ago = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();
  const auditLogs: AuditRow[] = [];

  // One MONEY_MOVEMENT entry per ledger transaction.
  const byTxn = new Map<string, typeof orders.ledgerEntries>();
  for (const e of orders.ledgerEntries) byTxn.set(e.txnId, [...(byTxn.get(e.txnId) ?? []), e]);
  for (const [txnId, lines] of byTxn) {
    const amount = lines.reduce((s, l) => s + l.debitCents, 0);
    auditLogs.push({
      id: id(),
      actorId: null,
      actorName: 'SYSTEM',
      action: 'MONEY_MOVEMENT',
      entityType: 'ORDER',
      entityId: lines[0].orderId,
      summary: `${lines[0].memo}: ${formatMoney(amount)}`,
      before: null,
      after: { txnId, lines: lines.map((l) => ({ account: l.account, debitCents: l.debitCents, creditCents: l.creditCents })) },
      ip: null,
      at: lines[0].createdAt,
    });
  }
  for (const d of orders.disputes.filter((x) => x.status === 'RESOLVED')) {
    auditLogs.push({
      id: id(),
      actorId: ids.adminId,
      actorName: 'Sam Mehta',
      action: 'DISPUTE_RESOLVED',
      entityType: 'ORDER',
      entityId: d.orderId,
      summary: `Dispute resolved: ${d.resolution?.toLowerCase().replace('_', ' ')}${d.refundCents ? `, ${formatMoney(d.refundCents)} refunded` : ''}`,
      before: { status: 'DISPUTED' },
      after: { resolution: d.resolution, refundCents: d.refundCents },
      ip: '203.0.113.10',
      at: d.resolvedAt!,
    });
  }
  auditLogs.sort((a, b) => b.at.localeCompare(a.at));

  // Reports: an off-platform payment request in chat, a suspected fake account, one already dismissed.
  const leoMessage = engagement.messages.find((m) => m.senderUserId === ids.leoId && m.masked);
  const suspicious = creators.creatorProfiles.find((p) => p.vettingStatus === 'APPROVED' && p.userId !== ids.leoId)!;
  const reports: ReportRow[] = [
    {
      id: id(30),
      reporterId: ids.brandId,
      targetType: 'CREATOR',
      targetId: suspicious.username!,
      reason: 'FAKE_ACCOUNT',
      details: 'Follower count looks bought — engagement on recent posts is almost zero.',
      status: 'OPEN',
      createdAt: ago(30),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    },
    {
      id: id(400),
      reporterId: ids.leoId,
      targetType: 'BRAND',
      targetId: ids.brandId,
      reason: 'SPAM',
      details: 'Sent the same brief three times.',
      status: 'DISMISSED',
      createdAt: ago(400),
      resolvedAt: ago(380),
      resolvedBy: ids.adminId,
      resolutionNote: 'Duplicate orders were cancelled by the brand; no abuse.',
    },
  ];
  if (leoMessage) {
    reports.unshift({
      id: id(10),
      reporterId: ids.brandId,
      targetType: 'MESSAGE',
      targetId: leoMessage.id,
      reason: 'OFF_PLATFORM_PAYMENT',
      details: 'Creator tried to share a phone number to arrange things outside the platform.',
      status: 'OPEN',
      createdAt: ago(10),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    });
  }
  return { auditLogs, reports };
}
