/** /brand/dashboard (FR-71): spend, orders by status, delivered post links, campaigns. */
import { Link } from 'react-router-dom';
import { LuArrowRight, LuExternalLink, LuSearch } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { orderStatusLabel } from '@/components/status';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderStatus } from '@/api/mock/orderMachine';
import { ActionQueue } from '@/features/orders/components/ActionQueue';
import { formatWhen } from '@/lib/dates';
import { SpendChart } from '../components/SpendChart';
import { useBrandStats } from '../hooks';

const ROWS: Array<{ status: OrderStatus; filter: string }> = [
  { status: 'PENDING_ACCEPTANCE', filter: 'pending' },
  { status: 'IN_PROGRESS', filter: 'in-progress' },
  { status: 'DELIVERED', filter: 'delivered' },
  { status: 'DISPUTED', filter: 'disputed' },
  { status: 'COMPLETED', filter: 'completed' },
  { status: 'CLOSED', filter: 'closed' },
  { status: 'REFUNDED', filter: 'closed' },
];

export function BrandDashboardPage() {
  const { user } = useAuth();
  const { data: s, isPending, isError, error, refetch } = useBrandStats();
  if (!user) return null;
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  const total = Object.values(s.ordersByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow={user.brand?.companyName ?? undefined}
        title={`Hi, ${user.name.split(' ')[0]}`}
        actions={
          <Link to="/search" className="btn btn--primary">
            <LuSearch aria-hidden /> Find creators
          </Link>
        }
      />
      {!user.emailVerified && (
        <div className="vetting vetting--warn" role="status">
          <div>
            <strong>Confirm your email</strong> to place orders and post campaigns.
          </div>
        </div>
      )}
      {!user.brand?.companyName && (
        <div className="vetting vetting--neutral" role="status">
          <div>
            <strong>Add your company details</strong> so creators know who they're working with.{' '}
            <Link to="/brand/profile" className="link">
              Company profile
            </Link>
          </div>
        </div>
      )}

      <ActionQueue role="BRAND" base="/brand/orders" />

      <div className="grid grid--stats">
        <Stat label="Spent" value={formatMoney(s.spentCents, s.currency)} hint="Charged, minus refunds" accent />
        <Stat label="In escrow" value={formatMoney(s.inEscrowCents, s.currency)} hint="Released when you approve" />
        <Stat label="Payment holds" value={formatMoney(s.authorisedCents, s.currency)} hint="Not charged until accepted" />
        <Stat
          label="Open campaigns"
          value={s.openCampaigns}
          hint={
            <Link to="/brand/campaigns" className="link">
              {s.pendingApplications} application{s.pendingApplications === 1 ? '' : 's'} to review
            </Link>
          }
        />
      </div>

      <div className="grid grid--2">
        <Card title="Spend per month">
          <SpendChart months={s.spendByMonth} currency={s.currency} />
        </Card>
        <Card title="Orders by status" action={<Link to="/brand/orders" className="link small">All orders</Link>}>
          {total === 0 ? (
            <EmptyState title="No orders yet">
              <Link to="/search" className="link">
                Find a creator
              </Link>{' '}
              and buy a package to get started.
            </EmptyState>
          ) : (
            <ul className="list">
              {ROWS.filter((r) => (s.ordersByStatus[r.status] ?? 0) > 0).map((r) => (
                <li key={r.status} className="list__item">
                  <div className="list__main">
                    <Link to={`/brand/orders?status=${r.filter}`} className="list__title link">
                      {orderStatusLabel(r.status)}
                    </Link>
                  </div>
                  {r.status === 'DELIVERED' && <Badge tone="warn">Review</Badge>}
                  <strong>{s.ordersByStatus[r.status]}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid">
        <Card title="Delivered posts">
          {s.deliveredPosts.length === 0 ? (
            <EmptyState title="No posts yet">Links to live posts appear here as creators deliver.</EmptyState>
          ) : (
            <ul className="list">
              {s.deliveredPosts.slice(0, 8).map((p) => (
                <li key={p.url + p.deliveredAt} className="list__item">
                  <div className="list__main">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="list__title link">
                      {p.orderTitle} <LuExternalLink aria-hidden style={{ verticalAlign: 'middle' }} />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <div className="list__meta">
                      {p.creatorName} · {formatWhen(p.deliveredAt)}
                    </div>
                  </div>
                  <Link to={`/brand/orders/${p.orderId}`} className="link small">
                    View order <LuArrowRight aria-hidden style={{ verticalAlign: 'middle' }} />
                    <span className="sr-only"> {p.orderTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
