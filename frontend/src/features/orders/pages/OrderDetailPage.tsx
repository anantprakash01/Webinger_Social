/** /brand/orders/:id, /creator/orders/:id and /admin/orders/:id — one order, as the viewer sees it. */
import { BrandReviewCard } from '@/features/retention/components/Panels';
import { useDocumentTitle } from '@/lib/documentTitle';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleCheck, LuMessageSquare, LuReceipt } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { OrderStatusBadge } from '@/components/status';
import { Badge, Card, ErrorState, PageSkeleton } from '@/components/ui';
import { ApiError } from '@/types';
import { ActionPanel } from '../components/ActionPanel';
import { DisputeCard } from '../components/DisputeCard';
import { OrderStepper } from '../components/OrderStepper';
import { DraftsCard, ExtensionCard, ShippingCard } from '../components/Collaboration';
import { BriefCard, Deliveries, MoneyCard, OrderedCard, ReviewCard, Timeline } from '../components/OrderParts';
import { shortId } from '../format';
import { useOrder } from '../hooks';
import { receiptKind } from './ReceiptPage';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const placed = (location.state as { placed?: boolean } | null)?.placed;
  const { data: o, isPending, isError, error, refetch, dataUpdatedAt } = useOrder(id);
  useDocumentTitle(o ? `Order: ${o.title}` : 'Order');
  const role = user?.role ?? 'BRAND';
  const listPath = role === 'CREATOR' ? '/creator/orders' : role === 'ADMIN' ? '/admin/orders' : '/brand/orders';

  if (isPending) return <PageSkeleton />;
  if (isError) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {error instanceof ApiError && error.status === 404 ? (
          <Card>
            <div className="state">
              <div className="state__title">Order not found</div>
              <div className="small">It may belong to another account.</div>
              <Link to={listPath} className="btn btn--secondary btn--sm">
                Back to orders
              </Link>
            </div>
          </Card>
        ) : (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const party = o.counterparty;
  const isAdmin = role === 'ADMIN';
  return (
    <div className="page order">
      <Link to={listPath} className="link small back-link">
        <LuArrowLeft aria-hidden /> All orders
      </Link>

      {placed && o.status === 'PENDING_ACCEPTANCE' && (
        <div className="vetting vetting--ok" role="status">
          <LuCircleCheck aria-hidden />
          <div>
            <strong>Order placed.</strong> {party.name.split(' ')[0]} has 72 hours to accept. Your payment is held, not charged.
          </div>
        </div>
      )}

      <header className="order__head">
        <div className="order__title">
          <div className="page__eyebrow">
            Order {shortId(o.id)} {o.kind === 'CUSTOM_OFFER' && <Badge tone="info">Custom offer</Badge>}
          </div>
          <h1 className="page__title">{o.title}</h1>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <OrderStatusBadge status={o.status} />
            {o.late && <Badge tone="danger">Late</Badge>}
          </div>
        </div>
        <div className="order__party">
          <CreatorPhoto name={party.name} url={party.photoUrl} seed={party.username ?? party.name} size={40} className="order__photo" />
          <div style={{ minWidth: 0 }}>
            <div className="list__meta">{role === 'CREATOR' ? 'Brand' : isAdmin ? `Creator · brand ${o.brand.name}` : 'Creator'}</div>
            {party.username ? (
              <Link to={`/u/${party.username}`} className="list__title link">
                {party.name}
              </Link>
            ) : (
              <div className="list__title">{party.name}</div>
            )}
          </div>
          {receiptKind(o, role) && (
            <Link to={`/receipts/${o.id}`} className="btn btn--secondary btn--sm">
              <LuReceipt aria-hidden /> Receipt
            </Link>
          )}
          {o.conversationId && !isAdmin && (
            <Link to={`/messages/${o.conversationId}`} className="btn btn--secondary btn--sm">
              <LuMessageSquare aria-hidden /> Message
            </Link>
          )}
        </div>
      </header>

      <OrderStepper o={o} />

      <div className="order__layout">
        <div className="order__main">
          <ActionPanel o={o} role={role} fetchedAt={dataUpdatedAt} />
          {o.dispute && <DisputeCard o={o} d={o.dispute} role={role} />}
          <ReviewCard o={o} role={role} />
          <BrandReviewCard o={o} role={role} />
          <ExtensionCard o={o} role={role} />
          <ShippingCard o={o} role={role} />
          <DraftsCard o={o} role={role} />
          <Deliveries o={o} role={role} />
          <BriefCard o={o} />
          <OrderedCard o={o} />
        </div>
        <aside className="order__side">
          <MoneyCard o={o} role={role} />
          <Timeline o={o} />
        </aside>
      </div>
    </div>
  );
}
