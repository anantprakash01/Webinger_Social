/**
 * /dev/stripe-connect — PROTOTYPE ONLY (VITE_API_MODE=mock). A plain stand-in for the
 * Stripe-hosted Connect onboarding page, clearly labelled as a mock and without Stripe's branding.
 * "Submit" plays the part of Stripe's account.updated webhook, then returns to the app like Stripe would.
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LuFlaskConical } from 'react-icons/lu';
import { Button, Card, FormError } from '@/components/ui';
import { useAuth } from '@/app/AuthContext';
import { useCompleteMockOnboarding } from '../hooks';

export function MockStripeConnectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const complete = useCompleteMockOnboarding();
  const account = params.get('account') ?? '';
  const back = params.get('return') ?? '/creator/onboarding?step=payouts';
  // Only app paths, never an arbitrary URL from the query string.
  const returnTo = back.startsWith('/') && !back.startsWith('//') ? back : '/creator/onboarding?step=payouts';

  const submit = async () => {
    await complete.mutateAsync(account);
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="mock-stripe">
      <Card>
        <div className="form-stack">
          <div className="mock-stripe__label" role="note">
            <LuFlaskConical aria-hidden /> Prototype — mock of the payment provider's onboarding page. Nothing here is real.
          </div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>Set up payouts</h1>
          <p className="small muted">
            In the real product this page is hosted by Stripe: it verifies identity and collects bank details, which never reach our servers.
          </p>
          <dl className="kv">
            <dt>Account</dt>
            <dd>
              <code>{account || '—'}</code>
            </dd>
            <dt>Name</dt>
            <dd>{user?.name}</dd>
            <dt>Bank</dt>
            <dd>Demo bank account ending 6789</dd>
          </dl>
          <FormError>{complete.error?.message}</FormError>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button onClick={() => void submit()} loading={complete.isPending} disabled={!account}>
              Submit details (demo)
            </Button>
            <Button variant="ghost" onClick={() => navigate(returnTo, { replace: true })}>
              Cancel and go back
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
