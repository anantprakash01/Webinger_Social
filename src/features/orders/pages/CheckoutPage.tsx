/**
 * Checkout (FR-30, FR-33, FR-60) for a package — /checkout/:packageId — and the custom-offer form
 * (FR-31) — /checkout/offer/:username. The payment is authorised, not
 * charged, until the creator accepts. Methods: UPI, card, netbanking, wallet app via Razorpay (v2.0).
 * The fee summary comes from the server's quote, so it always matches what is charged.
 */
import { useT } from '@/lib/i18n';
import { BrandMoneyLines } from '../components/TaxLines';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuCheck, LuClock, LuShieldCheck } from 'react-icons/lu';
import { RequireVerified } from '@/app/guards';
import { CreatorPhoto, PlatformLabel } from '@/components/creator';
import { Button, Card, ErrorState, FormError, Input, PageHeader, PageSkeleton, TextArea } from '@/components/ui';
import { PLATFORMS } from '@/lib/catalog';
import { formatMoney, parseAmount } from '@/lib/money';
import { ApiError, type OrderQuote } from '@/types';
import { BriefFields } from '../components/BriefFields';
import { useCreateOrder, useOrderQuote } from '../hooks';
import { emptyCheckoutForm, formFieldFor, makeCheckoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '../schemas';
import { collectOrderPayment } from '@/features/payments/hooks';
import { emptyChoice, PaymentPicker, payErrorsFrom, validateChoice, type PayChoice, type PayErrors } from '@/features/payments/components/PaymentPicker';
import { MIN_PRICE_CENTS } from '@/api/mock/fees';

export function CheckoutPage() {
  return (
    <RequireVerified action="place orders">
      <Checkout />
    </RequireVerified>
  );
}

function Checkout() {
  const { t } = useT();
  const { packageId, username } = useParams();
  const offerMode = !!username;
  const navigate = useNavigate();
  const create = useCreateOrder();
  const [formError, setFormError] = useState<string | null>(null);
  const [pay, setPay] = useState<PayChoice>(emptyChoice());
  const [payErrors, setPayErrors] = useState<PayErrors>({});
  const [paying, setPaying] = useState(false);
  // Phase C: package add-ons ticked by the brand; the server prices them into the quote and the order.
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(makeCheckoutSchema({ offer: offerMode, card: false })),
    defaultValues: emptyCheckoutForm(),
  });
  const { register, handleSubmit, setError, control, formState } = form;
  const errors = formState.errors;

  // Custom offers re-quote as the price changes (debounced); packages quote once.
  const price = useWatch({ control, name: 'price' });
  const [quotedPrice, setQuotedPrice] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!offerMode) return undefined;
    const t = setTimeout(() => {
      const c = parseAmount(price ?? '');
      setQuotedPrice(c !== null && c >= MIN_PRICE_CENTS ? c : undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [price, offerMode]);
  const quote = useOrderQuote(
    offerMode ? { creatorUsername: username, priceCents: quotedPrice ?? MIN_PRICE_CENTS } : { packageId, addonIds: addonIds.length ? [...addonIds].sort().join(',') : undefined },
    offerMode ? !!username : !!packageId,
  );

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const pe = validateChoice(pay);
    setPayErrors(pe);
    if (Object.keys(pe).length) return;
    if (!quote.data) return;
    setPaying(true);
    try {
      // Pay first (authorise only); the server verifies the payment before the order exists.
      const payment = await collectOrderPayment(pay, quote.data.totalCents);
      const res = await create.mutateAsync(offerMode ? { creatorUsername: username, offer: v.offer!, brief: v.brief!, payment } : { packageId, brief: v.brief!, payment, addonIds });
      navigate(`/brand/orders/${res.orderId}`, { replace: true, state: { placed: true } });
    } catch (e) {
      let placed = false;
      if (e instanceof ApiError) {
        const pe2 = payErrorsFrom(e.fieldErrors);
        if (Object.keys(pe2).length) {
          setPayErrors(pe2);
          placed = true;
        }
        for (const fe of e.fieldErrors) {
          const field = formFieldFor(fe.field);
          if (field) {
            setError(field, { message: fe.message });
            placed = true;
          }
        }
      }
      setFormError(placed ? 'Please check the highlighted fields.' : e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setPaying(false);
    }
  });

  if (quote.isPending && !quote.data) return <PageSkeleton />;
  if (quote.isError && !quote.data) {
    const gone = quote.error instanceof ApiError && (quote.error.status === 404 || quote.error.status === 409);
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {gone ? (
          <Card>
            <div className="state">
              <div className="state__title">{t('This offer is no longer available')}</div>
              <div className="small">{quote.error.message}</div>
              <Link to="/search" className="btn btn--secondary btn--sm">
                {t('Find other creators')}
              </Link>
            </div>
          </Card>
        ) : (
          <ErrorState message={quote.error.message} onRetry={() => void quote.refetch()} />
        )}
      </div>
    );
  }
  const q = quote.data!;

  return (
    <div className="page checkout">
      <PageHeader eyebrow={t(offerMode ? 'Custom offer' : 'Checkout')} title={offerMode ? t('Send {name} an offer', { name: q.creator.name.split(' ')[0] }) : t('Book this package')} />
      <form className="checkout__layout" onSubmit={(e) => {
          setPayErrors(validateChoice(pay));
          void onSubmit(e);
        }} noValidate>
        <div className="checkout__main">
          {offerMode && (
            <Card title={`1. ${t('Your offer')}`}>
              <div className="form-stack">
                <Input label={t('Title')} placeholder="e.g. Two TikToks for our summer launch" error={errors.title?.message} {...register('title')} />
                <div className="field">
                  <label className="field__label" htmlFor="offer-platform">
                    {t('Platform')}
                  </label>
                  <select id="offer-platform" className="field__input" {...register('platform')}>
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <TextArea label={t('Deliverables')} rows={3} hint="One per line, e.g. “2 TikTok videos (30–60 s)”." error={errors.deliverablesText?.message} {...register('deliverablesText')} />
                <div className="form-row">
                  <Input label={t('Price (₹)')} inputMode="decimal" placeholder="20000" hint={t('At least ₹500.')} error={errors.price?.message} {...register('price')} />
                  <Input label={t('Delivery (days after acceptance)')} inputMode="numeric" hint={t('1 to 60 days.')} error={errors.deliveryDays?.message} {...register('deliveryDays')} />
                </div>
              </div>
            </Card>
          )}

          <Card title={`${offerMode ? '2' : '1'}. ${t('Brief')}`}>
            <BriefFields form={form} />
          </Card>

          <Card title={`${offerMode ? '3' : '2'}. ${t('Payment')}`}>
            <PaymentPicker value={pay} onChange={setPay} errors={payErrors} />
          </Card>
        </div>

        <aside className="checkout__side">
          <Summary q={q} offerMode={offerMode} priceReady={!offerMode || quotedPrice !== undefined} addonIds={addonIds} onAddons={setAddonIds} />
          <FormError>{formError}</FormError>
          {/* On phones this sticks above the bottom nav, so paying never needs a scroll back (UX pass, item 4). */}
          <div className="checkout__pay">
            <span className="checkout__pay-total" aria-hidden>
              <span className="small muted">{t('Total')}</span>
              <strong>{!offerMode || quotedPrice !== undefined ? formatMoney(q.totalCents, q.currency) : '—'}</strong>
            </span>
            <Button type="submit" block loading={paying || create.isPending} disabled={offerMode && quotedPrice === undefined}>
              {(!offerMode || quotedPrice !== undefined) ? t(offerMode ? 'Send offer and pay {amount}' : 'Pay {amount}', { amount: formatMoney(q.totalCents, q.currency) }) : t('Send offer and pay')}
            </Button>
          </div>
          <p className="small muted checkout__fine">
            <LuShieldCheck aria-hidden style={{ verticalAlign: 'middle' }} />{' '}
            {t('Your payment is held now and charged only when {name} accepts. If they decline or don’t respond within {hours} hours, the hold is released. Money stays in escrow until you approve the work.', { name: q.creator.name.split(' ')[0], hours: q.acceptWindowHours })}{' '}
            <Link to="/refunds" className="link" target="_blank" rel="noopener">
              {t('Refund policy')}
            </Link>
          </p>
        </aside>
      </form>
    </div>
  );
}

function Summary({ q, offerMode, priceReady, addonIds, onAddons }: { q: OrderQuote; offerMode: boolean; priceReady: boolean; addonIds: string[]; onAddons: (ids: string[]) => void }) {
  const { t } = useT();
  const addons = q.package?.addons ?? [];
  const rush = addons.find((a) => a.kind === 'RUSH' && addonIds.includes(a.id));
  return (
    <Card>
      <div className="form-stack">
        <div className="row">
          <CreatorPhoto name={q.creator.name} url={q.creator.photoUrl} seed={q.creator.username ?? q.creator.name} size={44} className="checkout__photo" />
          <div style={{ minWidth: 0 }}>
            <div className="list__title">{q.creator.name}</div>
            {q.creator.username && (
              <Link to={`/u/${q.creator.username}`} className="list__meta link">
                @{q.creator.username}
              </Link>
            )}
          </div>
        </div>
        {q.package && (
          <div className="checkout__pkg">
            <PlatformLabel platform={q.package.platform} />
            <strong>{q.package.title}</strong>
            <ul className="package__deliverables">
              {q.package.deliverables.map((d) => (
                <li key={d}>
                  <LuCheck aria-hidden /> {d}
                </li>
              ))}
            </ul>
            <span className="small muted">
              <LuClock aria-hidden style={{ verticalAlign: 'middle' }} /> {t('Delivered within {days} days of acceptance', { days: rush?.rushDays ?? q.package.deliveryDays })}
            </span>
          </div>
        )}
        {addons.length > 0 && (
          <fieldset className="addons">
            <legend className="small">
              <strong>{t('Add-ons')}</strong> <span className="muted">{t('(optional)')}</span>
            </legend>
            {addons.map((a) => (
              <label key={a.id} className="check small addon">
                <input
                  type="checkbox"
                  checked={addonIds.includes(a.id)}
                  onChange={(e) => onAddons(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id))}
                />
                <span className="addon__title">{a.title}</span>
                <span className="addon__price">+{formatMoney(a.priceCents, q.currency)}</span>
              </label>
            ))}
            {!addons.some((a) => a.kind === 'USAGE_RIGHTS' && addonIds.includes(a.id)) && (
              <p className="small muted">{t('Without usage rights, the content is for organic posting only, not paid ads.')}</p>
            )}
          </fieldset>
        )}
        <dl className="money">
          <BrandMoneyLines priceLabel={t(offerMode ? 'Offer price' : addonIds.length ? 'Package + add-ons' : 'Package price')} priceCents={q.priceCents} brandFeeCents={q.brandFeeCents} brandFeeBps={q.brandFeeBps} totalCents={q.totalCents} taxes={q.taxes} currency={q.currency} ready={priceReady} />
        </dl>
      </div>
    </Card>
  );
}
