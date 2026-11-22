/**
 * /admin/finance (v3.4): money through the platform, balances owed, failed payouts with retry, and the
 * reconciliation of the ledger against payment, payout and subscription records.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCircleCheck, LuCircleX } from 'react-icons/lu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import { toast } from '@/components/feedback';
import { ShortMoney } from '@/components/Money';
import { Badge, Button, Card, EmptyState, ErrorState, FormError, PageHeader, PageSkeleton, Stat, cx } from '@/components/ui';
import { SpendChart } from '@/features/brands/components/SpendChart';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { FinanceOverview } from '@/types';

export function AdminFinancePage() {
  const [days, setDays] = useState(30);
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['admin', 'finance', days], queryFn: () => api.admin.finance(days) });
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  const f = data;
  const inr = (c: number) => <ShortMoney cents={c} currency="INR" />;

  return (
    <div className="page finance">
      <PageHeader
        title="Finance"
        actions={
          <select className="field__input" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        }
      />

      <div className="grid grid--stats">
        <Stat label="Order volume (GMV)" value={inr(f.flows.gmvCents)} hint={`${f.flows.ordersCaptured} orders captured`} accent />
        <Stat label="Platform revenue" value={inr(f.flows.platformRevenueCents)} hint="Fees and plans, excl. GST" />
        <Stat label="Refunded" value={inr(f.flows.refundsCents)} />
        <Stat label="Promotions" value={inr(f.flows.promotionsCents)} hint="Promo codes, credits, referral bonuses" />
      </div>

      <div className="grid grid--stats">
        <Stat label="In escrow now" value={inr(f.balances.escrowCents)} hint="Accepted, not yet approved" />
        <Stat label="Owed to creators" value={inr(f.balances.creatorBalancesCents)} hint={`${f.inTransit.count} payouts in transit (${formatMoney(f.inTransit.cents)})`} />
        <Stat label="GST payable" value={inr(f.balances.gstPayableCents)} />
        <Stat label="TDS / TCS to deposit" value={inr(f.balances.taxWithheldCents)} />
      </div>

      <div className="finance__cols">
        <Card title="Order volume by month">
          <SpendChart months={f.byMonth.map((m) => ({ month: m.month, cents: m.gmvCents }))} currency="INR" />
          <table className="table table--rows" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Volume</th>
                <th scope="col">Revenue</th>
                <th scope="col">Refunds</th>
              </tr>
            </thead>
            <tbody>
              {[...f.byMonth].reverse().map((m) => (
                <tr key={m.month}>
                  <td data-label="Month">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                  <td data-label="Volume">{formatMoney(m.gmvCents)}</td>
                  <td data-label="Revenue">{formatMoney(m.revenueCents)}</td>
                  <td data-label="Refunds">{formatMoney(m.refundsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`Money flows, ${formatDate(f.from)} – ${formatDate(f.to)}`}>
          <dl className="flows">
            <dt>Orders captured (GMV)</dt>
            <dd>{formatMoney(f.flows.gmvCents)}</dd>
            <dt>Plan subscriptions (incl. GST)</dt>
            <dd>{formatMoney(f.flows.subscriptionsCents)}</dd>
            <dt>Refunds to brands</dt>
            <dd className="neg">−{formatMoney(f.flows.refundsCents)}</dd>
            <dt>Platform revenue</dt>
            <dd>{formatMoney(f.flows.platformRevenueCents)}</dd>
            <dt>Promotions paid by us</dt>
            <dd className="neg">−{formatMoney(f.flows.promotionsCents)}</dd>
            <dt>GST collected</dt>
            <dd>{formatMoney(f.flows.gstCollectedCents)}</dd>
            <dt>TDS / TCS withheld</dt>
            <dd>{formatMoney(f.flows.taxWithheldCents)}</dd>
            <dt>Paid out to creators</dt>
            <dd>{formatMoney(f.flows.paidOutCents)}</dd>
            <dt>Instant payout fees</dt>
            <dd>{formatMoney(f.flows.payoutFeesCents)}</dd>
          </dl>
          <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
            Payments on hold (not captured): {formatMoney(f.balances.authorisedHoldsCents)}. Razorpay processing fees are not included.
          </p>
        </Card>
      </div>

      <FailedPayouts f={f} />
      <Reconciliation r={f.reconciliation} />
    </div>
  );
}

function FailedPayouts({ f }: { f: FinanceOverview }) {
  const qc = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const retry = useMutation({
    mutationFn: (id: string) => {
      if (!keys.current.has(id)) keys.current.set(id, newIdempotencyKey());
      return api.admin.retryPayout(id, keys.current.get(id)!);
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
      toast(`Sent again to ${p.destinationLabel}`);
    },
  });
  const open = f.payoutsNeedingAttention.filter((p) => !p.retriedAs);
  return (
    <Card title={`Failed payouts${open.length ? ` (${open.length} to retry)` : ''}`}>
      {f.payoutsNeedingAttention.length === 0 ? (
        <EmptyState title="No failed payouts" />
      ) : (
        <ul className="list">
          {f.payoutsNeedingAttention.map((p) => (
            <li key={p.id} className="list__item">
              <div className="list__main">
                <div className="list__title">
                  {p.creatorUsername ? (
                    <Link to={`/u/${p.creatorUsername}`} className="link">
                      {p.creatorName}
                    </Link>
                  ) : (
                    p.creatorName
                  )}{' '}
                  · {formatMoney(p.amountCents)}
                </div>
                <div className="list__meta">
                  {p.destinationLabel} · {formatDateTime(p.createdAt)} · account {p.accountStatus?.toLowerCase() ?? 'missing'}
                </div>
                <div className="small field__error">{p.failureReason}</div>
              </div>
              {p.retriedAs ? (
                <Badge tone="ok">Retried</Badge>
              ) : (
                <Button size="sm" loading={retry.isPending && retry.variables === p.id} disabled={p.accountStatus !== 'VERIFIED'} onClick={() => retry.mutate(p.id)}>
                  Retry payout
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError>{retry.error?.message ?? null}</FormError>
    </Card>
  );
}

function Reconciliation({ r }: { r: FinanceOverview['reconciliation'] }) {
  return (
    <Card title="Reconciliation" action={<Badge tone={r.ok ? 'ok' : 'danger'}>{r.ok ? 'All matched' : `${r.mismatches.length} to check`}</Badge>}>
      <ul className="recon">
        {r.checks.map((c) => (
          <li key={c.id} className={cx('recon__item', c.ok ? 'recon__item--ok' : 'recon__item--bad')}>
            {c.ok ? <LuCircleCheck aria-label="Matched" /> : <LuCircleX aria-label="Mismatch" />}
            <span>
              <strong>{c.label}</strong> <span className="muted">· {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {r.mismatches.length > 0 && (
        <table className="table table--rows" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Expected</th>
              <th scope="col">Found</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {r.mismatches.map((m) => (
              <tr key={`${m.check}-${m.ref}`}>
                <td data-label="Reference" className="small">
                  {m.ref}
                </td>
                <td data-label="Expected">{formatMoney(m.expectedCents)}</td>
                <td data-label="Found">{formatMoney(m.actualCents)}</td>
                <td data-label="Note" className="small">
                  {m.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        Checked {formatDateTime(r.checkedAt)}. The live system also compares Razorpay settlement and RazorpayX payout reports every hour and alerts on any difference.
      </p>
    </Card>
  );
}
