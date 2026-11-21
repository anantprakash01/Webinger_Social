/** Append-only audit log (FR-84): admin actions and money movements. */
import { formatMoney } from '@/lib/money';
import { getDb, now, ulid, type AuditRow, type UserRow } from './db';
import type { LedgerEntry } from './ledger';

/** Mock stand-in for the request IP (the backend records the real one). */
const MOCK_IP = '203.0.113.10';

export function audit(actor: UserRow | null, row: Omit<AuditRow, 'id' | 'actorId' | 'actorName' | 'ip' | 'at'>) {
  getDb().auditLogs.unshift({
    id: ulid(now().getTime()),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'SYSTEM',
    ip: actor ? MOCK_IP : null,
    at: now().toISOString(),
    ...row,
  });
}

/** One MONEY_MOVEMENT entry per ledger transaction. */
export function auditLedger(entries: LedgerEntry[], actor: UserRow | null) {
  if (entries.length === 0) return;
  const amount = entries.reduce((s, e) => s + e.debitCents, 0);
  audit(actor, {
    action: 'MONEY_MOVEMENT',
    entityType: entries[0].orderId.startsWith('payout_') ? 'PAYOUT' : 'ORDER',
    entityId: entries[0].orderId,
    summary: `${entries[0].memo}: ${formatMoney(amount)}`,
    before: null,
    after: { txnId: entries[0].txnId, lines: entries.map((e) => ({ account: e.account, debitCents: e.debitCents, creditCents: e.creditCents })) },
  });
}
