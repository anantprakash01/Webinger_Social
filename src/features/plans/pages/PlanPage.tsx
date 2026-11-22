/**
 * /brand/plan — Free, Pro and Premium (FR-66, v3.2): lower service fee and more pre-booking chats.
 * Upgrades are paid now through Razorpay (no proration: the new period starts today); downgrades and
 * cancellations take effect when the paid period ends.
 */
import { useState } from 'react';
import { LuCheck, LuCrown, LuReceipt } from 'react-icons/lu';
import { useConfirm, toast } from '@/components/feedback';
import { Badge, Button, Card, Drawer, ErrorState, FormError, PageHeader, PageSkeleton, cx } from '@/components/ui';
import { emptyChoice, PaymentPicker, payErrorsFrom, validateChoice, type PayChoice, type PayErrors } from '@/features/payments/components/PaymentPicker';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { PLAN_ORDER, type BillingCycle, type BrandPlan } from '@/lib/plans';
import { ApiError, type BrandSubscription, type PlanOffer } from '@/types';
import { useCancelPlan, useChangePlan, usePlanOffers, useSubscription } from '../hooks';

const gstOf = (cents: number, bps: number) => Math.floor((cents * bps + 5000) / 10000);
const rank = (p: BrandPlan) => PLAN_ORDER.indexOf(p);

export function PlanPage() {
  const sub = useSubscription();
  const offers = usePlanOffers();
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [buying, setBuying] = useState<PlanOffer | null>(null);
  const change = useChangePlan();
  const { cancel: cancelPlan } = useCancelPlan();
  const confirm = useConfirm();

  if (sub.isPending || offers.isPending) return <PageSkeleton />;
  if (sub.isError) return <div className="page"><ErrorState message={sub.error.message} onRetry={() => void sub.refetch()} /></div>;
  if (offers.isError) return <div className="page"><ErrorState message={offers.error.message} onRetry={() => void offers.refetch()} /></div>;
  const s = sub.data;
  const plans = offers.data.plans;
  const current = plans.find((p) => p.plan === s.plan)!;

  const choose = async (p: PlanOffer) => {
    const lower = rank(p.plan) < rank(s.plan) || (p.plan === s.plan && cycle === 'MONTHLY' && s.cycle === 'YEARLY');
    if (p.plan === 'FREE') {
      const ok = await confirm.ask({
        title: `End your ${current.name} plan?`,
        body: `You keep ${current.name} until ${s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : 'the period ends'}. After that the service fee goes back to ${p.brandFeeBps / 100}% and you get ${p.inquiryLimit} new pre-booking chats a month.`,
        confirmLabel: 'End at period end',
      });
      if (ok) cancelPlan.mutate();
      return;
    }
    if (s.status !== 'FREE' && lower) {
      const ok = await confirm.ask({
        title: `Switch to ${p.name} (${cycle.toLowerCase()})?`,
        body: `Nothing is charged now. You keep ${current.name} until ${formatDate(s.currentPeriodEnd!)}, then ${p.name} starts and renews ${cycle === 'YEARLY' ? 'yearly' : 'monthly'}.`,
        confirmLabel: 'Schedule the switch',
      });
      if (ok) change.mutate({ plan: p.plan, cycle }, { onSuccess: () => toast(`${p.name} starts on ${formatDate(s.currentPeriodEnd!)}`) });
      return;
    }
    setBuying(p);
  };

  return (
    <div className="page plan-page">
      <PageHeader title="Plan & billing" />
      <CurrentPlan s={s} current={current} />

      <div className="plan-cycle" role="radiogroup" aria-label="Billing">
        {(['MONTHLY', 'YEARLY'] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cycle === c} className={cx('platform-tab', cycle === c && 'is-on')} onClick={() => setCycle(c)}>
            {c === 'MONTHLY' ? 'Monthly' : 'Yearly · 2 months free'}
          </button>
        ))}
      </div>

      <div className="plan-grid">
        {plans.map((p) => {
          const price = cycle === 'YEARLY' ? p.yearlyCents : p.monthlyCents;
          const isCurrent = p.plan === s.plan && (p.plan === 'FREE' || s.cycle === cycle);
          const scheduled = (s.nextPlan ?? (s.nextCycle ? s.plan : null)) === p.plan && (s.nextCycle ?? s.cycle) === cycle && s.status === 'ACTIVE' && !isCurrent;
          const label =
            p.plan === 'FREE'
              ? s.plan === 'FREE'
                ? 'Current plan'
                : s.status === 'CANCELLING'
                  ? `Starts ${formatDate(s.currentPeriodEnd!)}`
                  : 'Downgrade to Free'
              : isCurrent
                ? 'Current plan'
                : scheduled
                  ? `Starts ${formatDate(s.currentPeriodEnd!)}`
                  : rank(p.plan) > rank(s.plan) || s.plan === 'FREE' || (p.plan === s.plan && cycle === 'YEARLY')
                    ? `Upgrade to ${p.name}`
                    : `Switch to ${p.name}`;
          return (
            <Card key={p.plan} className={cx('plan-card', p.plan === 'PRO' && 'plan-card--featured', isCurrent && 'is-current')}>
              <div className="plan-card__head">
                <h2 className="plan-card__name">
                  {p.plan !== 'FREE' && <LuCrown aria-hidden />} {p.name}
                </h2>
                {p.plan === 'PRO' && <Badge tone="info">Most popular</Badge>}
              </div>
              <p className="small muted">{p.tagline}</p>
              <div className="plan-card__price">
                {price === 0 ? (
                  <strong>₹0</strong>
                ) : (
                  <>
                    <strong>{formatMoney(price).replace(/\.00$/, '')}</strong>
                    <span className="small muted"> /{cycle === 'YEARLY' ? 'year' : 'month'} + 18% GST</span>
                  </>
                )}
              </div>
              <p className="plan-card__fee">
                <strong>{p.brandFeeBps / 100}%</strong> service fee on orders
              </p>
              <ul className="plan-card__features">
                {p.features.map((f) => (
                  <li key={f}>
                    <LuCheck aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <Button block variant={p.plan === 'PRO' && !isCurrent ? 'primary' : 'secondary'} disabled={isCurrent || scheduled || (p.plan === 'FREE' && s.status !== 'ACTIVE')} onClick={() => void choose(p)}>
                {label}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="small muted">
        Plans are billed in advance through Razorpay and renew automatically; cancel any time and keep the plan until the period ends. Upgrades start a new period today (no proration). The service fee on an order is
        fixed when you place it.
      </p>

      <Invoices s={s} />
      <Drawer open={!!buying} onClose={() => setBuying(null)} title={buying ? `${buying.name} plan` : ''}>
        {buying && <PayForPlan p={buying} cycle={cycle} onDone={() => setBuying(null)} />}
      </Drawer>
      {confirm.dialog}
    </div>
  );
}


function CurrentPlan({ s, current }: { s: BrandSubscription; current: PlanOffer }) {
  const { cancel, resume } = useCancelPlan();
  const confirm = useConfirm();
  const a = s.inquiries;
  return (
    <Card className="plan-current">
      <div className="plan-current__row">
        <div>
          <div className="small muted">Your plan</div>
          <div className="plan-current__name">
            {current.name} {s.cycle && <span className="small muted">· {s.cycle === 'YEARLY' ? 'yearly' : 'monthly'}</span>}
          </div>
          <div className="small">
            {s.status === 'FREE' && 'No subscription. Upgrade to pay a lower fee on every order.'}
            {s.status === 'ACTIVE' && s.currentPeriodEnd && (
              <>
                Renews on <strong>{formatDate(s.currentPeriodEnd)}</strong>
                {s.renewalCents !== null && ` for ${formatMoney(s.renewalCents)} incl. GST`}
                {s.methodLabel && ` · ${s.methodLabel}`}
                {s.nextPlan && ` · switches to ${s.nextPlan.charAt(0) + s.nextPlan.slice(1).toLowerCase()} then`}
                {!s.nextPlan && s.nextCycle && ` · switches to ${s.nextCycle.toLowerCase()} billing then`}
              </>
            )}
            {s.status === 'CANCELLING' && s.currentPeriodEnd && (
              <>
                Ends on <strong>{formatDate(s.currentPeriodEnd)}</strong>; you go back to Free then.
              </>
            )}
          </div>
        </div>
        <dl className="plan-current__facts">
          <dt>Service fee</dt>
          <dd>{s.brandFeeBps / 100}%</dd>
          <dt>Pre-booking chats</dt>
          <dd>{a.limit === null ? `${a.used} · unlimited` : `${a.used} of ${a.limit} used`}</dd>
        </dl>
      </div>
      {(s.status === 'CANCELLING' || s.nextPlan || s.nextCycle) && (
        <Button size="sm" variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()}>
          Keep {current.name} as it is
        </Button>
      )}
      {s.status === 'ACTIVE' && !s.nextPlan && !s.nextCycle && (
        <Button
          size="sm"
          variant="ghost"
          loading={cancel.isPending}
          onClick={async () => {
            if (await confirm.ask({ title: `Cancel ${current.name}?`, body: `You keep it until ${formatDate(s.currentPeriodEnd!)}. Nothing more is charged.`, confirmLabel: 'Cancel at period end' })) cancel.mutate();
          }}
        >
          Cancel plan
        </Button>
      )}
      <FormError>{cancel.error?.message ?? resume.error?.message ?? null}</FormError>
      {confirm.dialog}
    </Card>
  );
}

function PayForPlan({ p, cycle, onDone }: { p: PlanOffer; cycle: BillingCycle; onDone: () => void }) {
  const change = useChangePlan();
  const [pay, setPay] = useState<PayChoice>(emptyChoice());
  const [errors, setErrors] = useState<PayErrors>({});
  const [error, setError] = useState<string | null>(null);
  const price = cycle === 'YEARLY' ? p.yearlyCents : p.monthlyCents;
  const gst = gstOf(price, p.gstBps);
  const submit = async () => {
    const pe = validateChoice(pay);
    setErrors(pe);
    if (Object.keys(pe).length) return;
    setError(null);
    try {
      await change.mutateAsync({ plan: p.plan, cycle, pay: { choice: pay, totalCents: price + gst } });
      toast(`You're on ${p.name}. The ${p.brandFeeBps / 100}% fee applies to your next order.`);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        const pe2 = payErrorsFrom(e.fieldErrors);
        if (Object.keys(pe2).length) setErrors(pe2);
      }
      setError(e instanceof Error ? e.message : 'Payment failed. Try again.');
    }
  };
  return (
    <div className="form-stack">
      <dl className="money">
        <dt>
          {p.name} ({cycle === 'YEARLY' ? '1 year' : '1 month'})
        </dt>
        <dd>{formatMoney(price)}</dd>
        <dt>GST 18%</dt>
        <dd>{formatMoney(gst)}</dd>
        <dt className="money__total">Pay now</dt>
        <dd className="money__total">{formatMoney(price + gst)}</dd>
      </dl>
      <p className="small muted">Starts today and renews {cycle === 'YEARLY' ? 'every year' : 'every month'} on the same date. You get a GST invoice for each charge.</p>
      <PaymentPicker value={pay} onChange={setPay} errors={errors} />
      <FormError>{error}</FormError>
      <Button block loading={change.isPending} onClick={() => void submit()}>
        Pay {formatMoney(price + gst)}
      </Button>
    </div>
  );
}

function Invoices({ s }: { s: BrandSubscription }) {
  if (s.invoices.length === 0) return null;
  return (
    <Card title="Billing history">
      <table className="table table--rows">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Period</th>
            <th scope="col">Paid with</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {s.invoices.map((i) => (
            <tr key={i.id}>
              <td data-label="Invoice">
                <LuReceipt aria-hidden style={{ verticalAlign: 'middle' }} /> {i.number}
                <div className="list__meta">
                  {i.plan.charAt(0) + i.plan.slice(1).toLowerCase()} · {i.kind === 'RENEWAL' ? 'renewal' : i.kind === 'UPGRADE' ? 'upgrade' : 'new'}
                </div>
              </td>
              <td data-label="Period" className="small">
                {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
              </td>
              <td data-label="Paid with" className="small">
                {i.methodLabel}
              </td>
              <td data-label="Amount">
                {formatMoney(i.totalCents)}
                <div className="list__meta">
                  incl. {i.intraState ? 'CGST + SGST' : 'IGST'} {formatMoney(i.gstCents)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
