/**
 * Checkout (FR-30, FR-33, FR-60) for a package — /checkout/:packageId — and the custom-offer form
 * (FR-31) — /checkout/offer/:username. The card is authorised, not charged, until the creator accepts.
 * The fee summary comes from the server's quote, so it always matches what is charged.
 */
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuCheck, LuClock, LuShieldCheck } from 'react-icons/lu';
import { RequireVerified } from '@/app/guards';
import { CreatorPhoto, PlatformLabel } from '@/components/creator';
import { Button, Card, ErrorState, FormError, Input, PageHeader, PageSkeleton, TextArea } from '@/components/ui';
import { PLATFORMS } from '@/lib/catalog';
import { formatMoney, parseDollarsToCents } from '@/lib/money';
import { ApiError, type OrderQuote } from '@/types';
import { BriefFields } from '../components/BriefFields';
import { MockCardFields } from '../components/MockCardFields';
import { useCreateOrder, useOrderQuote } from '../hooks';
import { DECLINE_TEST_CARD, emptyCheckoutForm, formFieldFor, makeCheckoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '../schemas';
import { isMock } from '@/api/client';

export function CheckoutPage() {
  return (
    <RequireVerified action="place orders">
      <Checkout />
    </RequireVerified>
  );
}

function Checkout() {
  const { packageId, username } = useParams();
  const offerMode = !!username;
  const navigate = useNavigate();
  const create = useCreateOrder();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(makeCheckoutSchema({ offer: offerMode, card: isMock })),
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
      const c = parseDollarsToCents(price ?? '');
      setQuotedPrice(c !== null && c >= 1000 ? c : undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [price, offerMode]);
  const quote = useOrderQuote(offerMode ? { creatorUsername: username, priceCents: quotedPrice ?? 1000 } : { packageId }, offerMode ? !!username : !!packageId);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    // Prototype: Stripe's decline test card fails at confirmation, before any order exists.
    if (v.card?.number === DECLINE_TEST_CARD) {
      setFormError('Your card was declined. Try another card.');
      return;
    }
    try {
      const res = await create.mutateAsync(offerMode ? { creatorUsername: username, offer: v.offer!, brief: v.brief } : { packageId, brief: v.brief });
      navigate(`/brand/orders/${res.orderId}`, { replace: true, state: { placed: true } });
    } catch (e) {
      let placed = false;
      if (e instanceof ApiError) {
        for (const fe of e.fieldErrors) {
          const field = formFieldFor(fe.field);
          if (field) {
            setError(field, { message: fe.message });
            placed = true;
          }
        }
      }
      setFormError(placed ? 'Please check the highlighted fields.' : e instanceof Error ? e.message : 'Something went wrong. Try again.');
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
              <div className="state__title">This offer is no longer available</div>
              <div className="small">{quote.error.message}</div>
              <Link to="/search" className="btn btn--secondary btn--sm">
                Find other creators
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
      <PageHeader eyebrow={offerMode ? 'Custom offer' : 'Checkout'} title={offerMode ? `Send ${q.creator.name.split(' ')[0]} an offer` : 'Book this package'} />
      <form className="checkout__layout" onSubmit={onSubmit} noValidate>
        <div className="checkout__main">
          {offerMode && (
            <Card title="1. Your offer">
              <div className="form-stack">
                <Input label="Title" placeholder="e.g. Two TikToks for our summer launch" error={errors.title?.message} {...register('title')} />
                <div className="field">
                  <label className="field__label" htmlFor="offer-platform">
                    Platform
                  </label>
                  <select id="offer-platform" className="field__input" {...register('platform')}>
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <TextArea label="Deliverables" rows={3} hint="One per line, e.g. “2 TikTok videos (30–60 s)”." error={errors.deliverablesText?.message} {...register('deliverablesText')} />
                <div className="form-row">
                  <Input label="Price (USD)" inputMode="decimal" placeholder="250" hint="At least $10." error={errors.price?.message} {...register('price')} />
                  <Input label="Delivery (days after acceptance)" inputMode="numeric" hint="1 to 60 days." error={errors.deliveryDays?.message} {...register('deliveryDays')} />
                </div>
              </div>
            </Card>
          )}

          <Card title={`${offerMode ? '2' : '1'}. Brief`}>
            <BriefFields form={form} />
          </Card>

          <Card title={`${offerMode ? '3' : '2'}. Payment`}>
            {isMock ? <MockCardFields form={form} /> : <p className="small muted">The Stripe Payment Element loads here (Phase 1).</p>}
          </Card>
        </div>

        <aside className="checkout__side">
          <Summary q={q} offerMode={offerMode} priceReady={!offerMode || quotedPrice !== undefined} />
          <FormError>{formError}</FormError>
          <Button type="submit" block loading={create.isPending} disabled={offerMode && quotedPrice === undefined}>
            {offerMode ? 'Send offer and authorise ' : 'Authorise '}
            {(!offerMode || quotedPrice !== undefined) && formatMoney(q.totalCents, q.currency)}
          </Button>
          <p className="small muted checkout__fine">
            <LuShieldCheck aria-hidden style={{ verticalAlign: 'middle' }} /> Your card is authorised now and <strong>charged only when {q.creator.name.split(' ')[0]} accepts</strong>. If they
            decline or don't respond within {q.acceptWindowHours} hours, the hold is released. Money stays in escrow until you approve the work.
          </p>
        </aside>
      </form>
    </div>
  );
}

function Summary({ q, offerMode, priceReady }: { q: OrderQuote; offerMode: boolean; priceReady: boolean }) {
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
              <LuClock aria-hidden style={{ verticalAlign: 'middle' }} /> Delivered within {q.package.deliveryDays} days of acceptance
            </span>
          </div>
        )}
        <dl className="money">
          <dt>{offerMode ? 'Offer price' : 'Package price'}</dt>
          <dd>{priceReady ? formatMoney(q.priceCents, q.currency) : '—'}</dd>
          <dt>Service fee ({q.brandFeeBps / 100}%)</dt>
          <dd>{priceReady ? formatMoney(q.brandFeeCents, q.currency) : '—'}</dd>
          <dt className="money__total">Total</dt>
          <dd className="money__total">{priceReady ? formatMoney(q.totalCents, q.currency) : 'Enter a price'}</dd>
        </dl>
      </div>
    </Card>
  );
}
