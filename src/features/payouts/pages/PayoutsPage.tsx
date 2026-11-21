/** /creator/payouts (FR-63): balance, transfers from approved work, bank payout history. */
import { Link } from 'react-router-dom';
import { LuLandmark } from 'react-icons/lu';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { usePayoutOverview } from '@/features/admin/hooks';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export function PayoutsPage() {
  const { data, isPending, isError, error, refetch } = usePayoutOverview();
  if (isPending) return <PageSkeleton />;
  if (isError)
    return (
      <div className="page">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  const cur = data.currency;
  const enabled = data.payoutStatus === 'ENABLED';

  return (
    <div className="page">
      <PageHeader eyebrow="Creator workspace" title="Payouts" />
      {!enabled && (
        <div className="vetting vetting--warn" role="status">
          <LuLandmark aria-hidden />
          <div>
            <strong>{data.payoutStatus === 'PENDING' ? 'Your payout account is being checked.' : 'Set up payouts to get paid.'}</strong>{' '}
            Earnings stay in your balance until your bank account is connected.
          </div>
          {data.payoutStatus === 'NOT_STARTED' && (
            <Link to="/creator/onboarding?step=payouts" className="btn btn--secondary btn--sm">
              Set up payouts
            </Link>
          )}
        </div>
      )}

      <div className="grid grid--stats">
        <Stat label="Available balance" value={formatMoney(data.availableCents, cur)} hint={enabled ? `Paid out ${day(data.nextPayoutAt)}` : 'Waiting for payout setup'} accent />
        <Stat label="In escrow" value={formatMoney(data.inEscrowCents, cur)} hint="Released when brands approve" />
        <Stat label="Paid to your bank" value={formatMoney(data.paidOutCents, cur)} />
        <Stat label="Lifetime earnings" value={formatMoney(data.lifetimeEarnedCents, cur)} hint="After the platform fee" />
      </div>

      <div className="grid grid--2">
        <Card title="Bank payouts">
          <p className="small muted">Every Monday, your available balance is sent to your bank. It usually arrives in 2 business days.</p>
          {data.payouts.length === 0 ? (
            <EmptyState title="No payouts yet">Your first payout is sent on the Monday after a brand approves your work.</EmptyState>
          ) : (
            <ul className="list">
              {data.payouts.map((p) => (
                <li key={p.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{formatMoney(p.amountCents, cur)}</div>
                    <div className="list__meta">
                      Sent {day(p.createdAt)} · {p.status === 'PAID' ? 'arrived' : 'expected'} {day(p.arrivalDate)}
                    </div>
                  </div>
                  <Badge tone={p.status === 'PAID' ? 'ok' : 'info'}>{p.status === 'PAID' ? 'Paid' : 'In transit'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Earnings from orders">
          {data.transfers.length === 0 ? (
            <EmptyState title="No earnings yet">When a brand approves your delivery, your share moves here.</EmptyState>
          ) : (
            <ul className="list">
              {data.transfers.map((t) => (
                <li key={`${t.orderId}-${t.at}`} className="list__item">
                  <div className="list__main">
                    <Link to={`/creator/orders/${t.orderId}`} className="list__title row-link">
                      {t.orderTitle}
                    </Link>
                    <div className="list__meta">{day(t.at)}</div>
                  </div>
                  <strong>+{formatMoney(t.amountCents, cur)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
