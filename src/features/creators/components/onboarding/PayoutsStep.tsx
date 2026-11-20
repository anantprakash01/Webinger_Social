/** Wizard step 5 — payouts via Stripe Connect Express (FR-62). Mocked in Phase 0. */
import { LuCircleCheck, LuClock, LuShieldCheck, LuWallet } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { Button, FormError } from '@/components/ui';
import { useStartPayoutOnboarding } from '@/features/payouts/hooks';
import type { CreatorMe } from '@/types';
import { StepNav } from './StepNav';

export function PayoutsStep({ me, next, back, returnUrl = '/creator/onboarding?step=payouts' }: { me: CreatorMe; next?: () => void; back?: () => void; returnUrl?: string }) {
  const start = useStartPayoutOnboarding();
  const status = me.payoutStatus;

  return (
    <div className="form-stack">
      {status === 'ENABLED' ? (
        <div className="payout-state payout-state--ok" role="status">
          <LuCircleCheck size={24} aria-hidden />
          <div>
            <strong>Payouts are set up.</strong>
            <p className="small muted">When a brand approves your work, the money goes to your balance and then to your bank on the weekly schedule.</p>
          </div>
        </div>
      ) : status === 'PENDING' ? (
        <div className="payout-state" role="status">
          <LuClock size={24} aria-hidden />
          <div>
            <strong>Stripe is checking your details.</strong>
            <p className="small muted">This usually takes a few minutes. You can send your profile for review meanwhile.</p>
          </div>
        </div>
      ) : (
        <div className="payout-state">
          <LuWallet size={24} aria-hidden />
          <div>
            <strong>Connect a bank account to get paid.</strong>
            <p className="small muted">
              Our payment partner Stripe verifies your identity and holds your bank details — we never see them. It takes about five
              minutes.
            </p>
          </div>
        </div>
      )}

      <FormError>{start.error?.message}</FormError>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button variant={status === 'ENABLED' ? 'secondary' : 'primary'} loading={start.isPending} onClick={() => start.mutate(returnUrl)}>
          <LuShieldCheck aria-hidden /> {status === 'NOT_STARTED' ? 'Set up payouts with Stripe' : 'Update payout details'}
        </Button>
        {isMock && <span className="small muted">Prototype: opens a mock of the Stripe page.</span>}
      </div>

      {next && <StepNav back={back} next={next} nextDisabled={status === 'NOT_STARTED'} nextHint={status === 'NOT_STARTED' ? 'Set up payouts to continue.' : undefined} />}
    </div>
  );
}
