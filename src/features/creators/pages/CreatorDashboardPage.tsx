/** /creator/dashboard (FR-70): earnings, orders by status, profile views, setup state. */
import { Link } from 'react-router-dom';
import { LuArrowRight, LuEye, LuPackage, LuWallet } from 'react-icons/lu';
import { orderStatusLabel } from '@/components/status';
import { Badge, Card, ErrorState, PageHeader, PageSkeleton, Stat } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderStatus } from '@/api/mock/orderMachine';
import { MAX_ACTIVE_PACKAGES } from '../schemas';
import { VettingBanner } from '../components/VettingBanner';
import { useCreatorStats, useMyCreator } from '../workspaceHooks';

const ORDER_ROWS: OrderStatus[] = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'CLOSED', 'REFUNDED'];
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
      <PageHeader eyebrow="Creator workspace" title={`Hi, ${p.displayName.split(' ')[0]}`} />
      <VettingBanner status={p.vettingStatus} reason={p.rejectionReason} username={p.username} showApproved />

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
              {ORDER_ROWS.map((st) => (
                <li key={st} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{orderStatusLabel(st)}</div>
                  </div>
                  <strong>{s.ordersByStatus[st] ?? 0}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

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
