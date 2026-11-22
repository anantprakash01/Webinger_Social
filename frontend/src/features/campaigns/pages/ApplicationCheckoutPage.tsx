/**
 * /checkout/campaign/:campaignId/:applicationId — accepting an application is a checkout (FR-42):
 * the brand's payment is authorised for the applied price plus the brand fee, and the creator then has
 * 72 hours to accept the order. The campaign brief becomes the order brief.
 */
import { BrandMoneyLines } from '@/features/orders/components/TaxLines';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuShieldCheck } from 'react-icons/lu';
import { RequireVerified } from '@/app/guards';
import { CreatorPhoto } from '@/components/creator';
import { Button, Card, EmptyState, ErrorState, FormError, PageHeader, PageSkeleton, TextArea } from '@/components/ui';
import { useOrderQuote } from '@/features/orders/hooks';
import { emptyCheckoutForm, makeCheckoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '@/features/orders/schemas';
import { emptyChoice, PaymentPicker, payErrorsFrom, validateChoice, type PayChoice, type PayErrors } from '@/features/payments/components/PaymentPicker';
import { collectOrderPayment } from '@/features/payments/hooks';
import { ApiError } from '@/types';
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
  const [pay, setPay] = useState<PayChoice>(emptyChoice());
  const [payErrors, setPayErrors] = useState<PayErrors>({});
  const [paying, setPaying] = useState(false);
  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(makeCheckoutSchema({ offer: false, card: false, brief: false })),
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

  const onSubmit = form.handleSubmit(async () => {
    setFormError(null);
    const pe = validateChoice(pay);
    setPayErrors(pe);
    if (Object.keys(pe).length) return;
    setPaying(true);
    try {
      const payment = await collectOrderPayment(pay, q.totalCents);
      const res = await accept.mutateAsync({ note: note.trim() || null, payment });
      navigate(`/brand/orders/${res.orderId}`, { replace: true, state: { placed: true } });
    } catch (e) {
      const pe2 = e instanceof ApiError ? payErrorsFrom(e.fieldErrors) : {};
      setPayErrors(pe2);
      setFormError(Object.keys(pe2).length ? 'Please check the payment details.' : e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setPaying(false);
    }
  });

  return (
    <div className="page checkout">
      <PageHeader eyebrow={`Campaign · ${c.title}`} title={`Hire ${app.creator.name.split(' ')[0]}`} />
      <form className="checkout__layout" onSubmit={(e) => {
          setPayErrors(validateChoice(pay));
          void onSubmit(e);
        }} noValidate>
        <div className="checkout__main">
          <Card title="1. Their application">
            <div className="form-stack">
              <p className="small">{app.pitch}</p>
              <p className="small muted">{app.deliveryDays}-day delivery after they accept. The campaign brief and deliverables become the order brief.</p>
              <TextArea label="Extra instructions (optional)" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} hint="Added to the brief for this creator." />
            </div>
          </Card>
          <Card title="2. Payment">
            <PaymentPicker value={pay} onChange={setPay} errors={payErrors} />
          </Card>
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
                <BrandMoneyLines priceLabel="Their price" priceCents={q.priceCents} brandFeeCents={q.brandFeeCents} brandFeeBps={q.brandFeeBps} totalCents={q.totalCents} taxes={q.taxes} currency={q.currency} />
              </dl>
            </div>
          </Card>
          <FormError>{formError}</FormError>
          <div className="checkout__pay">
            <span className="checkout__pay-total" aria-hidden>
              <span className="small muted">Total</span>
              <strong>{formatMoney(q.totalCents, q.currency)}</strong>
            </span>
            <Button type="submit" block loading={paying || accept.isPending}>
              Hire and pay {formatMoney(q.totalCents, q.currency)}
            </Button>
          </div>
          <p className="small muted checkout__fine">
            <LuShieldCheck aria-hidden style={{ verticalAlign: 'middle' }} /> Your payment is held now and charged only when {app.creator.name.split(' ')[0]} accepts the order, within {q.acceptWindowHours} hours.
          </p>
        </aside>
      </form>
    </div>
  );
}
