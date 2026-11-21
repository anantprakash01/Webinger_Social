/** /creator/dashboard (FR-70): earnings, orders by status, profile views, setup state. */
import { AvailabilityCard } from '@/features/retention/components/Panels';
import { Link } from 'react-router-dom';
import { LuArrowRight, LuEye, LuPackage, LuWallet } from 'react-icons/lu';
import { orderStatusLabel } from '@/components/status';
import { Badge, Card, ErrorState, PageHeader, PageSkeleton, Stat } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderStatus } from '@/api/mock/orderMachine';
import { MAX_ACTIVE_PACKAGES } from '../schemas';
import { VettingBanner } from '../components/VettingBanner';
import { ActionQueue } from '@/features/orders/components/ActionQueue';
import { useCreatorStats, useMyCreator } from '../workspaceHooks';

const ORDER_ROWS: Array<{ status: OrderStatus; filter: string }> = [
  { status: 'PENDING_ACCEPTANCE', filter: 'pending' },
  { status: 'IN_PROGRESS', filter: 'in-progress' },
  { status: 'DELIVERED', filter: 'delivered' },
  { status: 'DISPUTED', filter: 'disputed' },
  { status: 'COMPLETED', filter: 'completed' },
  { status: 'CLOSED', filter: 'closed' },
  { status: 'REFUNDED', filter: 'closed' },
];
const PAYOUT_LABEL = { NOT_STARTED: ['warn', 'Not set up'], PENDING: ['info', 'Being checked'], ENABLED: ['ok', 'Active'] } as const;

export function CreatorDashboardPage() {
  const me = useMyCreator();
  const stats = useCreatorStats();

  if (me.isPending || stats.isPending) return <PageSkeleton />;
  if (me.isError || stats.isError) {
    const err = me.error ?? stats.error;
    return (
      <div className="page">
        <ErrorState message={err?.message} onRetry={() => void Promise.all([me.refetch(), stats.refetch()])} />
      </div>
    );
  }
  const p = me.data;
  const s = stats.data;
  const totalOrders = Object.values(s.ordersByStatus).reduce((a, b) => a + b, 0);
  const [payoutTone, payoutLabel] = PAYOUT_LABEL[p.payoutStatus];

  return (
    <div className="page">
      <PageHeader title={`Hi, ${p.displayName.split(' ')[0]}`} />
      <VettingBanner status={p.vettingStatus} reason={p.rejectionReason} username={p.username} showApproved />
      {p.vettingStatus === 'APPROVED' && <ActionQueue role="CREATOR" base="/creator/orders" />}

      <div className="grid grid--stats">
        <Stat label="Available balance" value={formatMoney(s.availableCents, s.currency)} hint="Paid out weekly" accent />
        <Stat label="In escrow" value={formatMoney(s.inEscrowCents, s.currency)} hint="Released when brands approve" />
        <Stat label="Lifetime earnings" value={formatMoney(s.lifetimeEarnedCents, s.currency)} />
        <Stat label="Profile views" value={s.profileViews.toLocaleString('en-US')} hint="All time" />
      </div>

      <div className="grid grid--2">
        <Card title="Orders by status">
          {totalOrders === 0 ? (
            <div className="state">
              <div className="state__title">No orders yet</div>
              <div className="small">Orders appear here when brands buy your packages or you accept a custom offer.</div>
            </div>
          ) : (
            <ul className="list">
              {ORDER_ROWS.filter((r) => (s.ordersByStatus[r.status] ?? 0) > 0).map((r) => (
                <li key={r.status} className="list__item">
                  <div className="list__main">
                    <Link to={`/creator/orders?status=${r.filter}`} className="list__title link">
                      {orderStatusLabel(r.status)}
                    </Link>
                  </div>
                  <strong>{s.ordersByStatus[r.status]}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {p.vettingStatus === 'APPROVED' && <AvailabilityCard value={p.availability} />}
        <Card title="Your setup">
          <ul className="list">
            <li className="list__item">
              <span className="social-icon">
                <LuPackage aria-hidden />
              </span>
              <div className="list__main">
                <div className="list__title">Packages</div>
                <div className="list__meta">
                  {s.activePackages} of {MAX_ACTIVE_PACKAGES} active
                </div>
              </div>
              <Link to="/creator/packages" className="btn btn--secondary btn--sm">
                Manage
              </Link>
            </li>
            <li className="list__item">
              <span className="social-icon">
                <LuWallet aria-hidden />
              </span>
              <div className="list__main">
                <div className="list__title">Payouts</div>
                <div className="list__meta">
                  <Badge tone={payoutTone}>{payoutLabel}</Badge>
                </div>
              </div>
              {p.payoutStatus !== 'ENABLED' && (
                <Link to="/creator/onboarding?step=payouts" className="btn btn--secondary btn--sm">
                  Set up
                </Link>
              )}
            </li>
            <li className="list__item">
              <span className="social-icon">
                <LuEye aria-hidden />
              </span>
              <div className="list__main">
                <div className="list__title">Public profile</div>
                <div className="list__meta">{p.username ? `/u/${p.username}` : 'Choose a username in setup'}</div>
              </div>
              <Link to={p.username ? `/u/${p.username}` : '/creator/onboarding'} className="btn btn--secondary btn--sm">
                {p.vettingStatus === 'APPROVED' ? 'View' : p.username ? 'Preview' : 'Set up'}
              </Link>
            </li>
          </ul>
          <Link to="/creator/onboarding" className="link small" style={{ display: 'inline-flex', marginTop: 12 }}>
            Edit profile <LuArrowRight aria-hidden style={{ verticalAlign: 'middle' }} />
          </Link>
        </Card>
      </div>
    </div>
  );
}
