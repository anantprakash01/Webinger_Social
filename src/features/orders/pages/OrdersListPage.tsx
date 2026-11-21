/** /brand/orders and /creator/orders — the viewer's orders with status filters. */
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { OrderStatusBadge } from '@/components/status';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, cx } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderSummary } from '@/types';
import { countdown, DEADLINE_LABEL, formatDay, serverNow, STATUS_FILTERS, viewerAmount } from '../format';
import { useOrders, useTicker } from '../hooks';

const PAGE_SIZE = 20;

export function OrdersListPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'BRAND';
  const [params, setParams] = useSearchParams();
  const filterKey = STATUS_FILTERS.some((f) => f.key === params.get('status')) ? params.get('status')! : 'all';
  const filter = STATUS_FILTERS.find((f) => f.key === filterKey)!;
  const page = Math.max(0, Number(params.get('page') ?? 1) - 1) || 0;
  const { data, isPending, isError, error, refetch, dataUpdatedAt, isPlaceholderData } = useOrders(filter.statuses.join(','), page);
  const deviceNow = useTicker();
  const navigate = useNavigate();
  const base = role === 'CREATOR' ? '/creator/orders' : '/brand/orders';

  const countFor = (statuses: string[]) => (data ? (statuses.length ? statuses.reduce((s, x) => s + (data.statusCounts[x] ?? 0), 0) : Object.values(data.statusCounts).reduce((a, b) => a + b, 0)) : null);
  const nowMs = data ? serverNow(data.serverTime, dataUpdatedAt, deviceNow) : deviceNow;

  return (
    <div className="page">
      <PageHeader
        eyebrow={role === 'CREATOR' ? 'Creator workspace' : 'Brand workspace'}
        title="Orders"
        actions={
          role === 'BRAND' ? (
            <Link to="/search" className="btn btn--primary btn--sm">
              Find creators
            </Link>
          ) : undefined
        }
      />

      <div className="platform-tabs" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const n = countFor(f.statuses);
          return (
            <button
              key={f.key}
              type="button"
              className={cx('platform-tab', f.key === filterKey && 'is-on')}
              aria-pressed={f.key === filterKey}
              onClick={() => setParams(f.key === 'all' ? {} : { status: f.key })}
            >
              {f.label}
              {n !== null && <span className="tab-count">{n}</span>}
            </button>
          );
        })}
      </div>

      <Card flush>
        {isError ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="card__body" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8 }} />
            ))}
          </div>
        ) : data.content.length === 0 ? (
          <EmptyState title={filterKey === 'all' ? 'No orders yet' : `No ${filter.label.toLowerCase()} orders`}>
            {role === 'BRAND' ? (
              <>
                Find a creator and buy a package to get started. <Link to="/search" className="link">Browse creators</Link>
              </>
            ) : (
              'Orders appear here when brands buy your packages or send you an offer.'
            )}
          </EmptyState>
        ) : (
          <div className="card__body">
            <table className={cx('table table--rows orders-table', isPlaceholderData && 'is-stale')}>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Status</th>
                  <th scope="col">Next step</th>
                  <th scope="col">{role === 'CREATOR' ? 'You receive' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((o) => (
                  <Row key={o.id} o={o} role={role} nowMs={nowMs} onOpen={() => navigate(`${base}/${o.id}`)} href={`${base}/${o.id}`} />
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalElements} size={PAGE_SIZE} onPage={(p) => setParams({ ...(filterKey !== 'all' && { status: filterKey }), page: String(p + 1) })} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ o, role, nowMs, href, onOpen }: { o: OrderSummary; role: 'BRAND' | 'CREATOR' | 'ADMIN'; nowMs: number; href: string; onOpen: () => void }) {
  const d = o.nextDeadline;
  const c = d ? countdown(d.at, nowMs) : null;
  return (
    <tr className="orders-table__row" onClick={onOpen}>
      <td className="td--title" data-label="Order">
        <div className="row">
          <CreatorPhoto name={o.counterparty.name} url={o.counterparty.photoUrl} seed={o.counterparty.username ?? o.counterparty.name} size={36} className="order__photo" />
          <div style={{ minWidth: 0 }}>
            <Link to={href} className="row-link" onClick={(e) => e.stopPropagation()}>
              {o.title}
            </Link>
            <div className="list__meta">{o.counterparty.name}</div>
          </div>
        </div>
      </td>
      <td data-label="Status">
        <span className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          <OrderStatusBadge status={o.status} />
          {o.late && <Badge tone="danger">Late</Badge>}
          {o.needsAction && <Badge tone="warn">Your turn</Badge>}
        </span>
      </td>
      <td data-label="Next step">
        {d && c ? (
          <span className={cx('small', c.urgent && 'deadline--urgent')}>
            {DEADLINE_LABEL[d.kind]} {formatDay(d.at)} · {c.text}
          </span>
        ) : (
          <span className="small muted">—</span>
        )}
      </td>
      <td data-label={role === 'CREATOR' ? 'You receive' : 'Total'}>
        <strong>{formatMoney(viewerAmount(o, role === 'ADMIN' ? 'BRAND' : role), o.money.currency)}</strong>
      </td>
    </tr>
  );
}
