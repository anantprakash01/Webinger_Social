/**
 * Phase 0 stand-in for Stripe's Payment Element. In production card details go only into Stripe's
 * iframe and never touch our code (PCI SAQ-A). Accepts Stripe's public test numbers.
 */
import type { UseFormReturn } from 'react-hook-form';
import { LuFlaskConical, LuLock } from 'react-icons/lu';
import { Input } from '@/components/ui';
import type { CheckoutFormValues } from '../schemas';

export function MockCardFields({ form }: { form: UseFormReturn<CheckoutFormValues, unknown, unknown> }) {
  const { register, formState } = form;
  const errors = formState.errors;
  return (
    <div className="form-stack">
      <div className="mock-stripe__label" role="note">
        <LuFlaskConical aria-hidden />
        <span>
          Prototype card form — use <code>4242 4242 4242 4242</code> to succeed or <code>4000 0000 0000 0002</code> to see a decline. Any future date and
          CVC.
        </span>
      </div>
      <Input label="Card number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" error={errors.cardNumber?.message} {...register('cardNumber')} />
      <div className="form-row">
        <Input label="Expiry" placeholder="MM / YY" autoComplete="cc-exp" error={errors.cardExpiry?.message} {...register('cardExpiry')} />
        <Input label="CVC" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} error={errors.cardCvc?.message} {...register('cardCvc')} />
      </div>
      <p className="small muted">
        <LuLock aria-hidden style={{ verticalAlign: 'middle' }} /> Payments are processed by Stripe. We never store card details.
      </p>
    </div>
  );
}
