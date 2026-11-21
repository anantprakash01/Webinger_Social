/**
 * Money lines with Indian taxes (phase B), shared by checkout, the order page and receipts so every
 * place shows the same breakdown. Renders <dt>/<dd> pairs inside a `dl.money`.
 */
import { formatMoney } from '@/lib/money';
import type { OrderTaxes } from '@/types';

const pct = (bps: number) => `${bps / 100}%`;

/** "GST 18% (CGST 9% + SGST 9%)" or "IGST 18%". */
export const gstLabel = (intraState: boolean) => (intraState ? 'GST 18% (CGST 9% + SGST 9%)' : 'IGST 18%');

/** What the brand pays: price, creator's GST, service fee, GST on it, total. */
export function BrandMoneyLines({ priceCents, brandFeeCents, brandFeeBps, totalCents, taxes, currency, priceLabel = 'Package price', ready = true }: { priceCents: number; brandFeeCents: number; brandFeeBps?: number; totalCents: number; taxes: OrderTaxes; currency: string; priceLabel?: string; ready?: boolean }) {
  const m = (c: number) => (ready ? formatMoney(c, currency) : '—');
  return (
    <>
      <dt>{priceLabel}</dt>
      <dd>{m(priceCents)}</dd>
      {taxes.creatorGstRegistered && (
        <>
          <dt>GST on creator’s service (18%)</dt>
          <dd>{m(taxes.creatorGstCents)}</dd>
        </>
      )}
      <dt>Service fee{brandFeeBps !== undefined ? ` (${pct(brandFeeBps)})` : ''}</dt>
      <dd>{m(brandFeeCents)}</dd>
      <dt>{gstLabel(taxes.intraState)} on service fee</dt>
      <dd>{m(taxes.brandFeeGstCents)}</dd>
      <dt className="money__total">Total</dt>
      <dd className="money__total">{ready ? formatMoney(totalCents, currency) : 'Enter a price'}</dd>
    </>
  );
}

/** What the creator receives: price (+ their GST), minus commission, GST on it, TDS and TCS. */
export function CreatorMoneyLines({ priceCents, creatorFeeCents, creatorPayoutCents, taxes, currency }: { priceCents: number; creatorFeeCents: number; creatorPayoutCents: number; taxes: OrderTaxes; currency: string }) {
  const m = (c: number) => formatMoney(c, currency);
  return (
    <>
      <dt>Price</dt>
      <dd>{m(priceCents)}</dd>
      {taxes.creatorGstRegistered && (
        <>
          <dt>GST collected for you (18%)</dt>
          <dd>{m(taxes.creatorGstCents)}</dd>
        </>
      )}
      <dt>Platform fee</dt>
      <dd>−{m(creatorFeeCents)}</dd>
      <dt>GST on platform fee (18%)</dt>
      <dd>−{m(taxes.creatorFeeGstCents)}</dd>
      <dt>TDS u/s 194-O (0.1%)</dt>
      <dd>−{m(taxes.tdsCents)}</dd>
      {taxes.creatorGstRegistered && (
        <>
          <dt>TCS u/s 52 CGST (0.5%)</dt>
          <dd>−{m(taxes.tcsCents)}</dd>
        </>
      )}
      <dt className="money__total">You receive</dt>
      <dd className="money__total">{m(creatorPayoutCents)}</dd>
    </>
  );
}
