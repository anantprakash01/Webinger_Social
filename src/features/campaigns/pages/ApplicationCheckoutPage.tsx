/**
 * /checkout/campaign/:campaignId/:applicationId — accepting an application is a checkout (FR-42):
 * the brand's card is authorised for the applied price plus the brand fee, and the creator then has
 * 72 hours to accept the order. The campaign brief becomes the order brief.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuShieldCheck } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { RequireVerified } from '@/app/guards';
import { CreatorPhoto } from '@/components/creator';
import { Button, Card, EmptyState, ErrorState, FormError, PageHeader, PageSkeleton, TextArea } from '@/components/ui';
import { MockCardFields } from '@/features/orders/components/MockCardFields';
import { useOrderQuote } from '@/features/orders/hooks';
import { DECLINE_TEST_CARD, emptyCheckoutForm, makeCheckoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '@/features/orders/schemas';
import { formatMoney } from '@/lib/money';
import { useAcceptApplication, useCampaign } from '../hooks';

export function ApplicationCheckoutPage() {
  return (
    <RequireVerified action="place orders">
      <Checkout />
    </RequireVerified>
  );
}

function Checkout() {
  const { campaignId = '', applicationId = '' } = useParams();
  const campaign = useCampaign(campaignId);
  const app = campaign.data?.applications.find((a) => a.id === applicationId);
  const quote = useOrderQuote({ creatorUsername: app?.creator.username ?? undefined, priceCents: app?.priceCents }, !!app?.creator.username);
  const accept = useAcceptApplication(applicationId);
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(makeCheckoutSchema({ offer: false, card: isMock, brief: false })),
    defaultValues: emptyCheckoutForm(),
  });

  if (campaign.isPending || (app && quote.isPending)) return <PageSkeleton />;
  if (campaign.isError) return <div className="page"><ErrorState message={campaign.error.message} onRetry={() => void campaign.refetch()} /></div>;
  if (!app || app.status !== 'PENDING') {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <Card>
          <EmptyState title="This application can no longer be accepted">
            <Link to={`/brand/campaigns/${campaignId}`} className="link">
              Back to the campaign
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (quote.isError) return <div className="page"><ErrorState message={quote.error.message} onRetry={() => void quote.refetch()} /></div>;
  const q = quote.data!;
  const c = campaign.data;

  const onSubmit = form.handleSubmit(async (v) => {
    setFormError(null);
    if (v.card?.number === DECLINE_TEST_CARD) {
      setFormError('Your card was declined. Try another card.');
      return;
    }
    try {
      const res = await accept.mutateAsync(note.trim() || null);
      navigate(`/brand/orders/${res.orderId}`, { replace: true, state: { placed: true } });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <div className="page checkout">
      <PageHeader eyebrow={`Campaign · ${c.title}`} title={`Hire ${app.creator.name.split(' ')[0]}`} />
      <form className="checkout__layout" onSubmit={onSubmit} noValidate>
        <div className="checkout__main">
          <Card title="1. Their application">
            <div className="form-stack">
              <p className="small">{app.pitch}</p>
              <p className="small muted">{app.deliveryDays}-day delivery after they accept. The campaign brief and deliverables become the order brief.</p>
              <TextArea label="Extra instructions (optional)" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} hint="Added to the brief for this creator." />
            </div>
          </Card>
          <Card title="2. Payment">{isMock ? <MockCardFields form={form} /> : <p className="small muted">The Stripe Payment Element loads here (Phase 1).</p>}</Card>
        </div>
        <aside className="checkout__side">
          <Card>
            <div className="form-stack">
              <div className="row">
                <CreatorPhoto name={app.creator.name} url={app.creator.photoUrl} seed={app.creator.username ?? app.creator.name} size={44} className="checkout__photo" />
                <div>
                  <div className="list__title">{app.creator.name}</div>
                  <div className="list__meta">{c.title}</div>
                </div>
              </div>
              <dl className="money">
                <dt>Their price</dt>
                <dd>{formatMoney(q.priceCents, q.currency)}</dd>
                <dt>Service fee ({q.brandFeeBps / 100}%)</dt>
                <dd>{formatMoney(q.brandFeeCents, q.currency)}</dd>
                <dt className="money__total">Total</dt>
                <dd className="money__total">{formatMoney(q.totalCents, q.currency)}</dd>
              </dl>
            </div>
          </Card>
          <FormError>{formError}</FormError>
          <div className="checkout__pay">
            <span className="checkout__pay-total" aria-hidden>
              <span className="small muted">Total</span>
              <strong>{formatMoney(q.totalCents, q.currency)}</strong>
            </span>
            <Button type="submit" block loading={accept.isPending}>
              Accept and authorise {formatMoney(q.totalCents, q.currency)}
            </Button>
          </div>
          <p className="small muted checkout__fine">
            <LuShieldCheck aria-hidden style={{ verticalAlign: 'middle' }} /> Your card is charged only when {app.creator.name.split(' ')[0]} accepts the order, within {q.acceptWindowHours} hours.
          </p>
        </aside>
      </form>
    </div>
  );
}
