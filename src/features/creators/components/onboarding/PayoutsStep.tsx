/** Wizard step 5 — payout account (FR-62, v2.0 India): PAN + bank account or UPI ID, verified by Razorpay. */
import { LuCircleCheck } from 'react-icons/lu';
import { Button, PageSkeleton } from '@/components/ui';
import { PayoutAccountForm } from '@/features/payments/components/PayoutAccountForm';
import { usePayoutOverview } from '@/features/payments/hooks';
import type { CreatorMe } from '@/types';
import { useState } from 'react';
import { StepNav } from './StepNav';

export function PayoutsStep({ me, next, back }: { me: CreatorMe; next?: () => void; back?: () => void }) {
  const overview = usePayoutOverview();
  const [editing, setEditing] = useState(false);
  if (overview.isPending) return <PageSkeleton />;
  const account = overview.data?.account ?? null;
  const ready = me.payoutStatus === 'ENABLED' && account?.status === 'VERIFIED';

  return (
    <div className="form-stack">
      {ready && !editing ? (
        <div className="payout-state payout-state--ok" role="status">
          <LuCircleCheck size={24} aria-hidden />
          <div>
            <strong>Payouts are set up.</strong>
            <p className="small muted">
              Money goes to <strong>{account.destinationLabel}</strong>. Approved work reaches your balance, then your account every Monday, or whenever you choose to
              withdraw.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Change payout account
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="small">Add where you want to be paid. Brands' payments are held safely until they approve your work, then released to you.</p>
          <PayoutAccountForm current={account} defaultName={me.displayName} onSaved={() => setEditing(false)} />
        </>
      )}
      {next && <StepNav back={back} next={next} nextDisabled={!ready} nextHint={!ready ? 'Add a payout account to continue.' : undefined} />}
    </div>
  );
}
