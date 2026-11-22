/**
 * /receipts/:id — printable documents (FR-65 stand-in for the backend's PDF; phase B Indian taxes).
 * Brand: a GST tax invoice — the platform's service fee with GST, and the creator's service (with GST when
 * the creator is registered, collected on the creator's behalf). Creator: an earnings statement with the
 * commission, GST on it, TDS u/s 194-O and TCS u/s 52. Admins see the brand's invoice.
 */
import { useDocumentTitle } from '@/lib/documentTitle';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuPrinter } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Logo, PRODUCT_NAME } from '@/components/Logo';
import { Button, Card, ErrorState, PageSkeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { SAC_CREATOR, SAC_PLATFORM, splitGst, stateName } from '@/api/mock/tax';
import type { OrderDetail } from '@/types';
import { shortId } from '../format';
import { useOrder } from '../hooks';
import { CreatorMoneyLines } from '../components/TaxLines';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const eventAt = (o: OrderDetail, type: string) => o.events.find((e) => e.type === type)?.at ?? null;
const fyOf = (iso: string) => {
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

/** What the creator was actually paid: partial refunds come out of their share, a full refund leaves nothing. */
export function creatorReceivedCents(o: OrderDetail): number {
  if (o.status === 'COMPLETED') return o.money.creatorPayoutCents;
  if (o.status === 'REFUNDED') return o.payment.refundedCents >= o.money.paidCents ? 0 : o.money.creatorPayoutCents - o.payment.refundedCents;
  return 0;
}

/** Which document the viewer can print for this order, if any. */
export function receiptKind(o: OrderDetail, role: string): 'BRAND' | 'CREATOR' | null {
  if (role === 'CREATOR') return o.status === 'COMPLETED' || (o.status === 'REFUNDED' && creatorReceivedCents(o) > 0) ? 'CREATOR' : null;
  return o.payment.status === 'CAPTURED' || o.payment.status === 'REFUNDED' ? 'BRAND' : null;
}

export function ReceiptPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const role = user?.role ?? 'BRAND';
  const { data: o, isPending, isError, error, refetch } = useOrder(id);
  useDocumentTitle(role === 'CREATOR' ? 'Earnings statement' : 'Tax invoice');
  const back = `/${role === 'ADMIN' ? 'admin' : role.toLowerCase()}/orders/${id}`;

  if (isPending) return <PageSkeleton />;
  if (isError)
    return (
      <div className="receipt-page">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  const kind = receiptKind(o, role);

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
            <div className="state__title">No document yet</div>
            <div className="small">
              {role === 'CREATOR' ? 'An earnings statement is available once the brand approves the work.' : 'The tax invoice is available once the payment has been charged (when the creator accepts).'}
            </div>
          </div>
        </Card>
      ) : kind === 'BRAND' ? (
        <TaxInvoice o={o} />
      ) : (
        <EarningsStatement o={o} />
      )}
    </div>
  );
}

function TaxInvoice({ o }: { o: OrderDetail }) {
  const m = o.money;
  const t = m.taxes;
  const cur = m.currency;
  const p = o.taxParties;
  const issued = eventAt(o, 'ACCEPT') ?? o.updatedAt;
  const fee = splitGst(t.brandFeeGstCents);
  const creatorGst = splitGst(t.creatorGstCents);
  const taxCols = (gst: number, split: { cgstCents: number; sgstCents: number }) =>
    t.intraState ? (
      <>
        <td className="num">{formatMoney(split.cgstCents, cur)}</td>
        <td className="num">{formatMoney(split.sgstCents, cur)}</td>
      </>
    ) : (
      <td className="num">{formatMoney(gst, cur)}</td>
    );
  const refundAt = eventAt(o, 'ADMIN_REFUND') ?? eventAt(o, 'ADMIN_CANCEL');
  const span = t.intraState ? 4 : 3;

  return (
    <article className="receipt" aria-label="Tax invoice">
      <header className="receipt__head">
        <Logo height={24} />
        <div className="receipt__title">
          <h1>Tax invoice</h1>
          <div className="small muted">
            WC/{fyOf(issued)}/{o.id.slice(-8)} · Order {shortId(o.id)}
          </div>
        </div>
      </header>

      <dl className="receipt__meta">
        <div>
          <dt>Supplier</dt>
          <dd>
            [Company legal name] ({PRODUCT_NAME})
            <br />
            <span className="small">
              GSTIN {p.platformGstin} · {stateName(p.platformState)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Billed to</dt>
          <dd>
            {o.brand.name}
            <br />
            <span className="small">{p.brandGstin ? `GSTIN ${p.brandGstin}` : 'Unregistered (B2C)'}</span>
          </dd>
        </div>
        <div>
          <dt>Invoice date</dt>
          <dd>{when(issued)}</dd>
        </div>
        <div>
          <dt>Place of supply</dt>
          <dd>{stateName(p.brandState ?? p.platformState) ?? '—'}</dd>
        </div>
      </dl>

      <table className="receipt__lines receipt__lines--tax">
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">SAC</th>
            <th scope="col" className="num">
              Taxable value
            </th>
            {t.intraState ? (
              <>
                <th scope="col" className="num">
                  CGST 9%
                </th>
                <th scope="col" className="num">
                  SGST 9%
                </th>
              </>
            ) : (
              <th scope="col" className="num">
                IGST 18%
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {o.title} — by {o.creator.name}
              <div className="small muted">
                {t.creatorGstRegistered ? `Creator GSTIN ${p.creatorGstin}. Collected on the creator's behalf.` : 'Creator not registered for GST: no GST on this line.'}
              </div>
            </td>
            <td>{SAC_CREATOR}</td>
            <td className="num">{formatMoney(m.priceCents, cur)}</td>
            {taxCols(t.creatorGstCents, creatorGst)}
          </tr>
          <tr>
            <td>{PRODUCT_NAME} service fee</td>
            <td>{SAC_PLATFORM}</td>
            <td className="num">{formatMoney(m.brandFeeCents, cur)}</td>
            {taxCols(t.brandFeeGstCents, fee)}
          </tr>
        </tbody>
        <tfoot>
          {m.paidCents < m.totalCents && (
            <>
              <tr>
                <th scope="row" colSpan={span}>
                  Invoice total
                </th>
                <td className="num">{formatMoney(m.totalCents, cur)}</td>
              </tr>
              {m.discount.promoCents > 0 && (
                <tr>
                  <th scope="row" colSpan={span}>
                    Promo {m.discount.promoCode} (borne by {PRODUCT_NAME})
                  </th>
                  <td className="num">−{formatMoney(m.discount.promoCents, cur)}</td>
                </tr>
              )}
              {m.discount.creditCents > 0 && (
                <tr>
                  <th scope="row" colSpan={span}>
                    Referral credit (borne by {PRODUCT_NAME})
                  </th>
                  <td className="num">−{formatMoney(m.discount.creditCents, cur)}</td>
                </tr>
              )}
            </>
          )}
          <tr>
            <th scope="row" colSpan={span}>
              Total paid ({o.payment.methodLabel} via Razorpay)
            </th>
            <td className="num">{formatMoney(m.paidCents, cur)}</td>
          </tr>
          {o.payment.refundedCents > 0 && (
            <tr>
              <th scope="row" colSpan={span}>
                Refunded{refundAt ? ` on ${when(refundAt)}` : ''} (credit note)
              </th>
              <td className="num">−{formatMoney(o.payment.refundedCents, cur)}</td>
            </tr>
          )}
        </tfoot>
      </table>

      <p className="small muted">
        Payment is held in escrow until the work is approved, then released to the creator. Tax payable on reverse charge: No. Amounts in {cur}. Prototype document: the live
        service issues a PDF invoice; supplier details are placeholders until registration.
      </p>
    </article>
  );
}

function EarningsStatement({ o }: { o: OrderDetail }) {
  const m = o.money;
  const cur = m.currency;
  const released = eventAt(o, 'APPROVE') ?? eventAt(o, 'AUTO_APPROVE') ?? eventAt(o, 'ADMIN_RELEASE') ?? eventAt(o, 'ADMIN_REFUND') ?? o.updatedAt;
  return (
    <article className="receipt" aria-label="Earnings statement">
      <header className="receipt__head">
        <Logo height={24} />
        <div className="receipt__title">
          <h1>Earnings statement</h1>
          <div className="small muted">
            E-{o.id.slice(-10)} · Order {shortId(o.id)}
          </div>
        </div>
      </header>
      <dl className="receipt__meta">
        <div>
          <dt>Paid to</dt>
          <dd>
            {o.creator.name}
            <br />
            <span className="small">{o.taxParties.creatorGstin ? `GSTIN ${o.taxParties.creatorGstin}` : 'Not registered for GST'}</span>
          </dd>
        </div>
        <div>
          <dt>Brand</dt>
          <dd>{o.brand.name}</dd>
        </div>
        <div>
          <dt>Released on</dt>
          <dd>{when(released)}</dd>
        </div>
        <div>
          <dt>Work</dt>
          <dd>{o.title}</dd>
        </div>
      </dl>
      <dl className="money receipt__money">
        <CreatorMoneyLines priceCents={m.priceCents} creatorFeeCents={m.creatorFeeCents} creatorPayoutCents={m.creatorPayoutCents} taxes={m.taxes} currency={cur} />
        {o.status === 'REFUNDED' && o.payment.refundedCents > 0 && (
          <>
            <dt>Partial refund to the brand (dispute)</dt>
            <dd>−{formatMoney(o.payment.refundedCents, cur)}</dd>
            <dt className="money__total">Received</dt>
            <dd className="money__total">{formatMoney(creatorReceivedCents(o), cur)}</dd>
          </>
        )}
      </dl>
      <p className="small muted">
        TDS u/s 194-O is deposited against your PAN and shows in Form 26AS / AIS; claim it in your income-tax return.
        {m.taxes.creatorGstRegistered && ' TCS u/s 52 is credited to your GST electronic cash ledger to set off against your GST.'} Amounts in {cur}. Paid out in your next payout.
      </p>
    </article>
  );
}
