/**
 * /creator/payouts (FR-62, FR-63; v2.0 India): balance, payout account, Withdraw now (standard or
 * instant), the weekly automatic payout, and history.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowRight, LuLandmark, LuSmartphone, LuZap } from 'react-icons/lu';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton, Stat, cx } from '@/components/ui';
import { formatMoney, parseAmount } from '@/lib/money';
import { useAuth } from '@/app/AuthContext';
import { PayoutAccountForm } from '@/features/payments/components/PayoutAccountForm';
import { usePayoutOverview, usePayoutSettings, useWithdraw } from '@/features/payments/hooks';
import { instantFee } from '@/features/payments/schemas';
import { ApiError, type PayoutOverview } from '@/types';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const SPEED_LABEL = { SCHEDULED: 'Weekly payout', STANDARD: 'Withdrawal', INSTANT: 'Instant withdrawal' } as const;

export function PayoutsPage() {
  const { data, isPending, isError, error, refetch } = usePayoutOverview();
  const { user } = useAuth();
  const settings = usePayoutSettings();
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  if (isPending) return <PageSkeleton />;
  if (isError)
    return (
      <div className="page">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  const cur = data.currency;
  const account = data.account;
  const verified = account?.status === 'VERIFIED';
  const canWithdraw = verified && data.availableCents >= data.minWithdrawalCents;

  return (
    <div className="page">
      <PageHeader
        title="Payouts"
        actions={
          <Button onClick={() => setWithdrawing(true)} disabled={!canWithdraw}>
            Withdraw now <LuArrowRight aria-hidden />
          </Button>
        }
      />
      {!verified && (
        <div className="vetting vetting--warn" role="status">
          <LuLandmark aria-hidden />
          <div>
            <strong>{account?.status === 'FAILED' ? 'We could not verify your payout account.' : 'Add a payout account to get paid.'}</strong> Earnings stay safely in your
            balance until then.
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {account ? 'Fix payout account' : 'Add payout account'}
          </Button>
        </div>
      )}
      {verified && !canWithdraw && data.availableCents > 0 && (
        <p className="small muted">You can withdraw once your available balance reaches {formatMoney(data.minWithdrawalCents, cur, { whole: true })}.</p>
      )}

      <div className="grid grid--stats">
        <Stat label="Available balance" value={formatMoney(data.availableCents, cur)} hint={data.autoWeekly && verified ? `Paid out ${day(data.nextPayoutAt)}` : 'Withdraw any time'} accent />
        <Stat label="In escrow" value={formatMoney(data.inEscrowCents, cur)} hint="Released when brands approve" />
        <Stat label="Paid out" value={formatMoney(data.paidOutCents, cur)} />
        <Stat label="Lifetime earnings" value={formatMoney(data.lifetimeEarnedCents, cur)} hint="After the platform fee" />
      </div>

      <div className="grid grid--2">
        <Card title="Payout account">
          {account ? (
            <div className="form-stack">
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <span className="wallet-txn__icon" aria-hidden>
                  {account.method === 'UPI' ? <LuSmartphone /> : <LuLandmark />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="list__title">{account.destinationLabel}</div>
                  <div className="list__meta">
                    {account.holderName} · PAN {account.panMasked}
                  </div>
                </div>
                <Badge tone={verified ? 'ok' : account.status === 'FAILED' ? 'danger' : 'info'}>{verified ? 'Verified' : account.status === 'FAILED' ? 'Failed' : 'Checking'}</Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Change payout account
              </Button>
            </div>
          ) : (
            <EmptyState title="No payout account yet">Add a bank account or UPI ID to receive your earnings.</EmptyState>
          )}
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={data.autoWeekly} disabled={settings.isPending} onChange={(e) => settings.mutate(e.target.checked)} />
            <span>
              <strong className="small">Automatic weekly payout</strong>
              <span className="list__meta">Every Monday, your whole available balance is sent to your account. Turn off to withdraw only when you choose.</span>
            </span>
          </label>
        </Card>

        <Card title="Payout history">
          {data.payouts.length === 0 ? (
            <EmptyState title="No payouts yet">Use Withdraw now, or wait for the Monday payout after a brand approves your work.</EmptyState>
          ) : (
            <ul className="list">
              {data.payouts.map((p) => (
                <li key={p.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">
                      {formatMoney(p.amountCents - p.feeCents, cur)} {p.speed === 'INSTANT' && <LuZap aria-label="Instant" />}
                    </div>
                    <div className="list__meta">
                      {SPEED_LABEL[p.speed]} to {p.destinationLabel} · {day(p.createdAt)}
                      {p.feeCents > 0 && ` · fee ${formatMoney(p.feeCents, cur)}`}
                    </div>
                    {p.status === 'FAILED' && <div className="small field__error">{p.failureReason ?? 'The bank rejected this payout.'} The money is back in your balance; our team will send it again.</div>}
                  </div>
                  <Badge tone={p.status === 'PAID' ? 'ok' : p.status === 'FAILED' ? 'danger' : 'info'}>{p.status === 'PAID' ? 'Paid' : p.status === 'FAILED' ? 'Failed' : 'On its way'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Tax withheld · FY ${data.financialYear}`}>
        <dl className="money">
          <dt>TDS u/s 194-O (0.1%)</dt>
          <dd>{formatMoney(data.tdsWithheldCents, cur)}</dd>
          {(data.tcsWithheldCents > 0 || account?.gstin) && (
            <>
              <dt>TCS u/s 52 CGST (0.5%)</dt>
              <dd>{formatMoney(data.tcsWithheldCents, cur)}</dd>
            </>
          )}
        </dl>
        <p className="small muted">
          Deposited against your PAN every month. TDS shows in Form 26AS / AIS and can be claimed in your income-tax return
          {account?.gstin ? '; TCS is credited to your GST cash ledger' : ''}. Earnings above are after these deductions.
        </p>
      </Card>

      <Card title="Earnings from orders">
        {data.transfers.length === 0 ? (
          <EmptyState title="No earnings yet">When a brand approves your delivery, your share moves here.</EmptyState>
        ) : (
          <ul className="list">
            {data.transfers.map((t) => (
              <li key={`${t.orderId}-${t.at}`} className="list__item">
                <div className="list__main">
                  <Link to={`/creator/orders/${t.orderId}`} className="list__title row-link">
                    {t.orderTitle}
                  </Link>
                  <div className="list__meta">{day(t.at)}</div>
                </div>
                <strong>+{formatMoney(t.amountCents, cur)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Drawer open={editing} onClose={() => setEditing(false)} title={account ? 'Change payout account' : 'Add a payout account'}>
        {editing && <PayoutAccountForm current={account} defaultName={user?.name ?? ''} onSaved={() => setEditing(false)} />}
      </Drawer>
      <Drawer open={withdrawing} onClose={() => setWithdrawing(false)} title="Withdraw now">
        {withdrawing && <Withdraw o={data} onDone={() => setWithdrawing(false)} />}
      </Drawer>
    </div>
  );
}

function Withdraw({ o, onDone }: { o: PayoutOverview; onDone: () => void }) {
  const withdraw = useWithdraw();
  const [amount, setAmount] = useState(String(o.availableCents / 100));
  const [speed, setSpeed] = useState<'STANDARD' | 'INSTANT'>('STANDARD');
  const cents = parseAmount(amount);
  const error =
    amount && (cents === null || cents < o.minWithdrawalCents || cents > o.availableCents)
      ? `Enter ${formatMoney(o.minWithdrawalCents, o.currency, { whole: true })} to ${formatMoney(o.availableCents, o.currency)}.`
      : undefined;
  const fee = cents && speed === 'INSTANT' ? instantFee(cents) : 0;
  const serverError = withdraw.error instanceof ApiError ? withdraw.error.message : withdraw.error?.message;

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (cents && !error) withdraw.mutate({ amountCents: cents, speed }, { onSuccess: onDone });
      }}
    >
      <Input label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} hint={`Available: ${formatMoney(o.availableCents, o.currency)}`} />
      <fieldset className="radio-stack">
        <legend className="field__label">Speed</legend>
        {(
          [
            ['STANDARD', 'Standard', 'Free · by the next working day (NEFT)'],
            ['INSTANT', 'Instant', `${o.instantFeeBps / 100}% fee, at least ${formatMoney(o.instantFeeMinCents, o.currency, { whole: true })} · within minutes (IMPS/UPI)`],
          ] as const
        ).map(([v, label, hint]) => (
          <label key={v} className={cx('radio-card', speed === v && 'is-on')}>
            <input type="radio" name="speed" value={v} checked={speed === v} onChange={() => setSpeed(v)} />
            <span>
              <strong className="small">{label}</strong>
              <span className="list__meta">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {cents && !error && (
        <dl className="money">
          <dt>Withdraw</dt>
          <dd>{formatMoney(cents, o.currency)}</dd>
          {fee > 0 && (
            <>
              <dt>Instant fee</dt>
              <dd>−{formatMoney(fee, o.currency)}</dd>
            </>
          )}
          <dt className="money__total">You receive</dt>
          <dd className="money__total">{formatMoney(cents - fee, o.currency)}</dd>
        </dl>
      )}
      <p className="small muted">To {o.account?.destinationLabel}.</p>
      <FormError>{serverError}</FormError>
      <Button type="submit" loading={withdraw.isPending} disabled={!cents || !!error}>
        Withdraw {cents && !error ? formatMoney(cents - fee, o.currency) : ''}
      </Button>
    </form>
  );
}
