/**
 * How the brand pays (v2.0, India): UPI, card, netbanking or a wallet app, through Razorpay. Saved cards
 * and UPI IDs come first. Details go to Razorpay (or the mock's stand-in), never to our servers.
 */
import { useT } from '@/lib/i18n';
import { useEffect, useId } from 'react';
import { LuBuilding2, LuCreditCard, LuSmartphone, LuWallet } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { cx, Input } from '@/components/ui';
import { NETBANKING_BANKS, WALLET_APPS } from '../schemas';
import { useSavedMethods } from '../hooks';

export type PayMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET_APP';
export interface PayChoice {
  method: PayMethod;
  /** A saved card token or saved UPI ID; null = enter new details. */
  savedMethodId: string | null;
  vpa: string;
  saveVpa: boolean;
  card: { number: string; expiry: string; cvc: string; save: boolean };
  bank: string;
  app: string;
}
export type PayErrors = Partial<Record<'method' | 'vpa' | 'card.number' | 'card.expiry' | 'card.cvc' | 'bank' | 'app', string>>;

export const emptyChoice = (method: PayMethod = 'UPI'): PayChoice => ({
  method,
  savedMethodId: null,
  vpa: '',
  saveVpa: true,
  card: { number: '', expiry: '', cvc: '', save: true },
  bank: '',
  app: '',
});

/** Field errors from the payment step (422 from Razorpay's stand-in) mapped onto the picker. */
export function payErrorsFrom(fieldErrors: Array<{ field: string; message: string }>): PayErrors {
  const out: PayErrors = {};
  for (const f of fieldErrors) if (['vpa', 'card.number', 'card.expiry', 'card.cvc', 'bank', 'app'].includes(f.field)) out[f.field as keyof PayErrors] = f.message;
  return out;
}

/** Client-side checks before anything is sent, so obvious mistakes show at once. */
export function validateChoice(c: PayChoice): PayErrors {
  const e: PayErrors = {};
  if (c.method === 'UPI' && !c.savedMethodId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(c.vpa.trim())) e.vpa = 'Enter a UPI ID like name@okhdfcbank.';
  if (c.method === 'CARD' && !c.savedMethodId) {
    if (!/^\d{16}$/.test(c.card.number.replace(/\s+/g, ''))) e['card.number'] = 'Enter the 16-digit card number.';
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(c.card.expiry.trim())) e['card.expiry'] = 'Enter the expiry as MM / YY.';
    if (!/^\d{3,4}$/.test(c.card.cvc.trim())) e['card.cvc'] = 'Enter the 3 or 4 digits on the back.';
  }
  if (c.method === 'NETBANKING' && !c.bank) e.bank = 'Choose your bank.';
  if (c.method === 'WALLET_APP' && !c.app) e.app = 'Choose a wallet.';
  return e;
}

export function PaymentPicker({ value, onChange, errors = {} }: { value: PayChoice; onChange: (c: PayChoice) => void; errors?: PayErrors }) {
  const { t } = useT();
  const name = useId();
  const saved = useSavedMethods().data?.content ?? [];
  const set = (patch: Partial<PayChoice>) => onChange({ ...value, ...patch });
  const savedUpi = saved.filter((m) => m.type === 'UPI');
  const savedCards = saved.filter((m) => m.type === 'CARD');

  // Preselect the brand's saved UPI ID once it loads (the most common way to pay in India).
  const firstUpi = savedUpi[0]?.id ?? null;
  useEffect(() => {
    if (firstUpi && value.method === 'UPI' && !value.savedMethodId && !value.vpa) onChange({ ...value, savedMethodId: firstUpi });
  }, [firstUpi]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (method: PayMethod) => set({ method, savedMethodId: method === 'UPI' ? (savedUpi[0]?.id ?? null) : method === 'CARD' ? (savedCards[0]?.id ?? null) : null });

  const option = (method: PayMethod, icon: React.ReactNode, title: string, hint: React.ReactNode) => (
    <label className={cx('radio-card', value.method === method && 'is-on')}>
      <input type="radio" name={name} value={method} checked={value.method === method} onChange={() => choose(method)} />
      <span className="pay-option__icon" aria-hidden>
        {icon}
      </span>
      <span>
        <strong className="small">{title}</strong>
        <span className="list__meta">{hint}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="radio-stack pay-picker">
      <legend className="sr-only">{t('Payment method')}</legend>
      {option('UPI', <LuSmartphone />, 'UPI', 'Google Pay, PhonePe, Paytm or any UPI app')}
      {value.method === 'UPI' && (
        <div className="pay-details">
          {savedUpi.map((m) => (
            <label key={m.id} className="check small">
              <input type="radio" name={`${name}-upi`} checked={value.savedMethodId === m.id} onChange={() => set({ savedMethodId: m.id })} />
              <span>{m.label}</span>
            </label>
          ))}
          {savedUpi.length > 0 && (
            <label className="check small">
              <input type="radio" name={`${name}-upi`} checked={!value.savedMethodId} onChange={() => set({ savedMethodId: null })} />
              <span>{t('Another UPI ID')}</span>
            </label>
          )}
          {!value.savedMethodId && (
            <>
              <Input label="UPI ID" placeholder="yourname@okhdfcbank" autoComplete="off" value={value.vpa} onChange={(e) => set({ vpa: e.target.value })} error={errors.vpa} hint={isMock ? 'Demo: success@razorpay pays, failure@razorpay is declined.' : t('You approve the payment in your UPI app.')} />
              <label className="check small">
                <input type="checkbox" checked={value.saveVpa} onChange={(e) => set({ saveVpa: e.target.checked })} />
                <span>{t('Save this UPI ID for next time')}</span>
              </label>
            </>
          )}
        </div>
      )}
      {option('CARD', <LuCreditCard />, t('Debit or credit card'), 'Visa, Mastercard, RuPay, Amex')}
      {value.method === 'CARD' && (
        <div className="pay-details">
          {savedCards.map((m) => (
            <label key={m.id} className="check small">
              <input type="radio" name={`${name}-card`} checked={value.savedMethodId === m.id} onChange={() => set({ savedMethodId: m.id })} />
              <span>
                {m.label} <span className="muted">· expires {m.expiry}</span>
              </span>
            </label>
          ))}
          {savedCards.length > 0 && (
            <label className="check small">
              <input type="radio" name={`${name}-card`} checked={!value.savedMethodId} onChange={() => set({ savedMethodId: null })} />
              <span>{t('New card')}</span>
            </label>
          )}
          {!value.savedMethodId && (
            <>
              {isMock && <p className="small muted">Demo: 4111 1111 1111 1111 pays, 4000 0000 0000 0002 is declined. Any future expiry and CVC.</p>}
              <Input label={t('Card number')} inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" value={value.card.number} onChange={(e) => set({ card: { ...value.card, number: e.target.value } })} error={errors['card.number']} />
              <div className="form-row">
                <Input label={t('Expiry')} placeholder="MM / YY" autoComplete="cc-exp" value={value.card.expiry} onChange={(e) => set({ card: { ...value.card, expiry: e.target.value } })} error={errors['card.expiry']} />
                <Input label="CVC" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={value.card.cvc} onChange={(e) => set({ card: { ...value.card, cvc: e.target.value } })} error={errors['card.cvc']} />
              </div>
              <label className="check small">
                <input type="checkbox" checked={value.card.save} onChange={(e) => set({ card: { ...value.card, save: e.target.checked } })} />
                <span>{t('Save this card securely (RBI-compliant token) for next time')}</span>
              </label>
            </>
          )}
          <p className="small muted">{t('Your bank may ask for an OTP.')}</p>
        </div>
      )}
      {option('NETBANKING', <LuBuilding2 />, t('Netbanking'), t('All major Indian banks'))}
      {value.method === 'NETBANKING' && (
        <div className="pay-details">
          <ChoiceSelect label={t('Your bank')} value={value.bank} onChange={(bank) => set({ bank })} options={NETBANKING_BANKS.map((b) => ({ value: b.code, label: b.name }))} placeholder={t('Choose your bank')} error={errors.bank} />
        </div>
      )}
      {option('WALLET_APP', <LuWallet />, t('Wallet app'), 'Paytm, PhonePe, Amazon Pay, MobiKwik')}
      {value.method === 'WALLET_APP' && (
        <div className="pay-details">
          <ChoiceSelect label={t('Wallet')} value={value.app} onChange={(app) => set({ app })} options={WALLET_APPS.map((a) => ({ value: a.code, label: a.name }))} placeholder={t('Choose a wallet')} error={errors.app} />
        </div>
      )}
      <p className="small muted pay-picker__secure">{t('Payments are processed by Razorpay. Card details go to Razorpay directly; we never see or store them.')}</p>
    </fieldset>
  );
}

function ChoiceSelect({ label, value, onChange, options, placeholder, error }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder: string; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field__input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={`${id}-err`} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
