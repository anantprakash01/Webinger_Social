/**
 * Money lines with Indian taxes (phase B), shared by checkout, the order page and receipts so every
 * place shows the same breakdown. Renders <dt>/<dd> pairs inside a `dl.money`.
 */
import { useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { OrderDiscountApi, OrderTaxes } from '@/types';

const pct = (bps: number) => `${bps / 100}%`;

/** "GST 18% (CGST 9% + SGST 9%)" or "IGST 18%". */
export const gstLabel = (intraState: boolean) => (intraState ? 'GST 18% (CGST 9% + SGST 9%)' : 'IGST 18%');

/** What the brand pays: price, creator's GST, service fee, GST on it, total; v3.3 promo/credit and "You pay". */
export function BrandMoneyLines({
  priceCents,
  brandFeeCents,
  brandFeeBps,
  totalCents,
  taxes,
  currency,
  priceLabel,
  ready = true,
  discount,
}: {
  priceCents: number;
  brandFeeCents: number;
  brandFeeBps?: number;
  totalCents: number;
  taxes: OrderTaxes;
  currency: string;
  priceLabel?: string;
  ready?: boolean;
  discount?: OrderDiscountApi | null;
}) {
  const { t } = useT();
  const m = (c: number) => (ready ? formatMoney(c, currency) : '—');
  const off = discount ? discount.promoCents + discount.creditCents : 0;
  return (
    <>
      <dt>{priceLabel ?? t('Package price')}</dt>
      <dd>{m(priceCents)}</dd>
      {taxes.creatorGstRegistered && (
        <>
          <dt>{t('GST on creator’s service (18%)')}</dt>
          <dd>{m(taxes.creatorGstCents)}</dd>
        </>
      )}
      <dt>{t('Service fee')}{brandFeeBps !== undefined ? ` (${pct(brandFeeBps)})` : ''}</dt>
      <dd>{m(brandFeeCents)}</dd>
      <dt>{t('{gst} on service fee', { gst: gstLabel(taxes.intraState) })}</dt>
      <dd>{m(taxes.brandFeeGstCents)}</dd>
      <dt className={off ? undefined : 'money__total'}>{t('Total')}</dt>
      <dd className={off ? undefined : 'money__total'}>{ready ? formatMoney(totalCents, currency) : t('Enter a price')}</dd>
      {discount && discount.promoCents > 0 && (
        <>
          <dt className="money__discount">{t('Promo {code}', { code: discount.promoCode ?? '' })}</dt>
          <dd className="money__discount">−{m(discount.promoCents)}</dd>
        </>
      )}
      {discount && discount.creditCents > 0 && (
        <>
          <dt className="money__discount">{t('Referral credit')}</dt>
          <dd className="money__discount">−{m(discount.creditCents)}</dd>
        </>
      )}
      {off > 0 && (
        <>
          <dt className="money__total">{t('You pay')}</dt>
          <dd className="money__total">{m(totalCents - off)}</dd>
        </>
      )}
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
