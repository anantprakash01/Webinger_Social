import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuMailWarning } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Button, Card, FormError } from '@/components/ui';
import { useResendVerification } from '../hooks';
import { DemoInbox } from './DemoInbox';

/** Thin banner at the top of the app for unverified users (FR-02). */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const resend = useResendVerification();
  if (!user || user.emailVerified) return null;
  const action = user.role === 'CREATOR' ? 'accept orders' : 'place orders';
  return (
    <div className="verify-banner" role="status">
      <span className="verify-banner__text">
        <LuMailWarning aria-hidden />
        <span>
          <strong>Confirm your email</strong> to {action}. We sent a link to {user.email}.
        </span>
      </span>
      {resend.isSuccess ? (
        <span>New link sent.</span>
      ) : (
        <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
          Resend link
        </Button>
      )}
      <Link to="/verify-email" className="link small">
        Open
      </Link>
    </div>
  );
}

/** Shown in place of an order screen while the email is unverified (FR-02). */
export function VerifyEmailGate({ action }: { action: string }) {
  const { user } = useAuth();
  const resend = useResendVerification();
  const [sentAt, setSentAt] = useState(0);
  if (!user) return null;
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <Card>
        <div style={{ display: 'grid', gap: 16 }}>
          <LuMailWarning size={28} aria-hidden />
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>Verify your email to {action}</h1>
          <p className="muted">
            We sent a confirmation link to <strong>{user.email}</strong>. Open it, then come back here. Payments are held in escrow, so we need to
            be able to reach you about every order.
          </p>
          <FormError>{resend.error?.message}</FormError>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button
              loading={resend.isPending}
              onClick={() => resend.mutate(undefined, { onSuccess: () => setSentAt(Date.now()) })}
            >
              Send a new link
            </Button>
            {sentAt > 0 && <span className="small">New link sent.</span>}
          </div>
          <DemoInbox key={sentAt} to={user.email} />
        </div>
      </Card>
    </div>
  );
}
