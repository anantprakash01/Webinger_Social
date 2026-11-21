/**
 * Creator payout account (FR-62, v2.0 India): PAN and a bank account (account number + IFSC) or a UPI ID.
 * Saving creates the Razorpay Route linked account and verifies the destination (penny drop / UPI check).
 */
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isMock } from '@/api/client';
import { Button, FormError, Input, Segmented } from '@/components/ui';
import { applyServerErrors } from '@/lib/forms';
import type { PayoutAccount, PayoutAccountInput } from '@/types';
import { payoutAccountInputSchema, type PayoutAccountFormInput } from '../schemas';
import { useSavePayoutAccount } from '../hooks';

const FIELDS = ['pan', 'holderName', 'method', 'accountNumber', 'ifsc', 'vpa'] as const;

export function PayoutAccountForm({ current, defaultName, onSaved }: { current: PayoutAccount | null; defaultName: string; onSaved?: (a: PayoutAccount) => void }) {
  const save = useSavePayoutAccount();
  const { register, handleSubmit, control, setValue, setError, formState } = useForm<PayoutAccountFormInput, unknown, PayoutAccountInput>({
    resolver: zodResolver(payoutAccountInputSchema),
    defaultValues: { pan: '', holderName: current?.holderName ?? defaultName, method: current?.method ?? 'BANK_ACCOUNT', accountNumber: '', ifsc: '', vpa: '' },
  });
  const method = useWatch({ control, name: 'method' });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    try {
      const a = await save.mutateAsync(v);
      if (a.status === 'VERIFIED') onSaved?.(a);
    } catch (e) {
      applyServerErrors(e, setError, FIELDS);
    }
  });

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <Segmented
        label="Get paid to"
        value={method}
        onChange={(m) => setValue('method', m)}
        options={[
          { value: 'BANK_ACCOUNT', label: 'Bank account' },
          { value: 'UPI', label: 'UPI ID' },
        ]}
      />
      <div className="form-row">
        <Input label="Name on the account" autoComplete="name" error={errors.holderName?.message} {...register('holderName')} />
        <Input label="PAN" placeholder="ABCDE1234F" autoComplete="off" maxLength={10} style={{ textTransform: 'uppercase' }} hint="Needed for KYC and tax (TDS)." error={errors.pan?.message} {...register('pan')} />
      </div>
      {method === 'BANK_ACCOUNT' ? (
        <div className="form-row">
          <Input label="Account number" inputMode="numeric" autoComplete="off" error={errors.accountNumber?.message} {...register('accountNumber')} />
          <Input label="IFSC" placeholder="HDFC0001234" autoComplete="off" maxLength={11} style={{ textTransform: 'uppercase' }} error={errors.ifsc?.message} {...register('ifsc')} />
        </div>
      ) : (
        <Input label="UPI ID" placeholder="yourname@okaxis" autoComplete="off" error={errors.vpa?.message} {...register('vpa')} />
      )}
      {isMock && <p className="small muted">Demo: any valid details are verified at once; account number 000000000 or a UPI ID ending in @fail is rejected.</p>}
      <p className="small muted">We send ₹1 to check bank accounts (it isn't taken back). Details are held by our payment partner Razorpay.</p>
      {current?.status === 'FAILED' && <FormError>{current.failureReason}</FormError>}
      <FormError>{save.error && !Object.keys(errors).length ? save.error.message : null}</FormError>
      <div>
        <Button type="submit" loading={save.isPending}>
          {current ? 'Save payout account' : 'Verify and save'}
        </Button>
      </div>
    </form>
  );
}
