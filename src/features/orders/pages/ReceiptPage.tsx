/**
 * /receipts/:id — printable receipt (FR-65 stand-in for the backend's PDF). A brand gets a receipt
 * for the card charge; a creator gets an earnings statement once money has been released to them.
 * Admins see the brand's receipt. Printing hides everything but the receipt (see admin.css).
 */
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuPrinter } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Logo, PRODUCT_NAME } from '@/components/Logo';
import { Button, Card, ErrorState, PageSkeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderDetail } from '@/types';
import { shortId } from '../format';
import { useOrder } from '../hooks';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const eventAt = (o: OrderDetail, type: string) => o.events.find((e) => e.type === type)?.at ?? null;

/** What the creator was actually paid: partial refunds come out of their share, a full refund leaves nothing. */
export function creatorReceivedCents(o: OrderDetail): number {
  if (o.status === 'COMPLETED') return o.money.creatorPayoutCents;
  if (o.status === 'REFUNDED') return o.payment.refundedCents >= o.money.totalCents ? 0 : o.money.creatorPayoutCents - o.payment.refundedCents;
  return 0;
}

/** Which receipt the viewer can print for this order, if any. */
export function receiptKind(o: OrderDetail, role: string): 'BRAND' | 'CREATOR' | null {
  if (role === 'CREATOR') return o.status === 'COMPLETED' || (o.status === 'REFUNDED' && creatorReceivedCents(o) > 0) ? 'CREATOR' : null;
  return o.payment.status === 'CAPTURED' || o.payment.status === 'REFUNDED' ? 'BRAND' : null;
}

export function ReceiptPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const role = user?.role ?? 'BRAND';
  const { data: o, isPending, isError, error, refetch } = useOrder(id);
  const back = `/${role === 'ADMIN' ? 'admin' : role.toLowerCase()}/orders/${id}`;

  if (isPending) return <PageSkeleton />;
  if (isError)
    return (
      <div className="receipt-page">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  const kind = receiptKind(o, role);
  const m = o.money;
  const cur = m.currency;

  return (
    <div className="receipt-page">
      <div className="receipt-page__bar no-print">
        <Link to={back} className="link small back-link">
          <LuArrowLeft aria-hidden /> Back to order
        </Link>
        {kind && (
          <Button size="sm" onClick={() => window.print()}>
            <LuPrinter aria-hidden /> Print or save as PDF
          </Button>
        )}
      </div>
      {!kind ? (
        <Card>
          <div className="state">
            <div className="state__title">No receipt yet</div>
            <div className="small">
              {role === 'CREATOR' ? 'An earnings statement is available once the brand approves the work.' : 'A receipt is available once the card has been charged (when the creator accepts).'}
            </div>
          </div>
        </Card>
      ) : (
        <article className="receipt" aria-label={kind === 'BRAND' ? 'Receipt' : 'Earnings statement'}>
          <header className="receipt__head">
            <Logo height={24} />
            <div className="receipt__title">
              <h1>{kind === 'BRAND' ? 'Receipt' : 'Earnings statement'}</h1>
              <div className="small muted">
                {kind === 'BRAND' ? 'R' : 'E'}-{o.id.slice(-10)} · Order {shortId(o.id)}
              </div>
            </div>
          </header>

          <dl className="receipt__meta">
            <div>
              <dt>{kind === 'BRAND' ? 'Billed to' : 'Paid to'}</dt>
              <dd>{kind === 'BRAND' ? o.brand.name : o.creator.name}</dd>
            </div>
            <div>
              <dt>{kind === 'BRAND' ? 'Creator' : 'Brand'}</dt>
              <dd>{kind === 'BRAND' ? o.creator.name : o.brand.name}</dd>
            </div>
            <div>
              <dt>{kind === 'BRAND' ? 'Charged on' : 'Released on'}</dt>
              <dd>{when((kind === 'BRAND' ? eventAt(o, 'ACCEPT') : (eventAt(o, 'APPROVE') ?? eventAt(o, 'AUTO_APPROVE') ?? eventAt(o, 'ADMIN_RELEASE') ?? eventAt(o, 'ADMIN_REFUND'))) ?? o.updatedAt)}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{kind === 'BRAND' ? 'Card (via Stripe)' : 'Stripe Connect balance'}</dd>
            </div>
          </dl>

          <table className="receipt__lines">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {o.title}
                  <div className="small muted">{o.deliverables.join(' · ')}</div>
                </td>
                <td className="num">{formatMoney(m.priceCents, cur)}</td>
              </tr>
              {kind === 'BRAND' ? (
                <tr>
                  <td>{PRODUCT_NAME} service fee</td>
                  <td className="num">{formatMoney(m.brandFeeCents, cur)}</td>
                </tr>
              ) : (
                <tr>
                  <td>{PRODUCT_NAME} creator fee</td>
                  <td className="num">−{formatMoney(m.creatorFeeCents, cur)}</td>
                </tr>
              )}
              {o.status === 'REFUNDED' && kind === 'CREATOR' && o.payment.refundedCents > 0 && (
                <tr>
                  <td>Partial refund to the brand (dispute)</td>
                  <td className="num">−{formatMoney(o.payment.refundedCents, cur)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {kind === 'BRAND' ? (
                <>
                  <tr>
                    <th scope="row">Total charged</th>
                    <td className="num">{formatMoney(m.totalCents, cur)}</td>
                  </tr>
                  {o.payment.refundedCents > 0 && (
                    <>
                      <tr>
                        <th scope="row">Refunded{eventAt(o, 'ADMIN_REFUND') && ` on ${when(eventAt(o, 'ADMIN_REFUND')!)}`}</th>
                        <td className="num">−{formatMoney(o.payment.refundedCents, cur)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Net paid</th>
                        <td className="num">{formatMoney(m.totalCents - o.payment.refundedCents, cur)}</td>
                      </tr>
                    </>
                  )}
                </>
              ) : (
                <tr>
                  <th scope="row">You received</th>
                  <td className="num">{formatMoney(creatorReceivedCents(o), cur)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          <p className="small muted">
            {kind === 'BRAND'
              ? `${PRODUCT_NAME} holds the payment in escrow until the work is approved, then releases it to the creator. Amounts in ${cur}.`
              : `Paid to your bank in the weekly payout after release. Amounts in ${cur}.`}{' '}
            Prototype receipt: the live service issues a PDF.
          </p>
        </article>
      )}
    </div>
  );
}
