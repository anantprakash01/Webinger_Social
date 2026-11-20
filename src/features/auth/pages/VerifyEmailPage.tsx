import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuMail } from 'react-icons/lu';
import { homePath, useAuth } from '@/app/AuthContext';
import { Button, FormError } from '@/components/ui';
import { AuthLayout } from '../components/AuthLayout';
import { DemoInbox } from '../components/DemoInbox';
import { useResendVerification, useVerifyEmail } from '../hooks';

/**
 * FR-02. Two modes:
 *  - /verify-email?token=…  confirms the address from the email link
 *  - /verify-email          "check your inbox" for a signed-in, unverified user, with resend
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return <AuthLayout title="One quick check.">{token ? <ConfirmToken token={token} /> : <CheckInbox />}</AuthLayout>;
}

function ConfirmToken({ token }: { token: string }) {
  const { user } = useAuth();
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    // Run once, even under StrictMode's double effect: the token is single-use.
    if (started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (verify.isError) {
    return (
      <div className="auth__form">
        <h2>That link didn't work</h2>
        <FormError>{verify.error.message}</FormError>
        {user ? (
          <Link to="/verify-email" className="btn btn--primary btn--block">
            Get a new link
          </Link>
        ) : (
          <Link to="/login" className="btn btn--primary btn--block">
            Log in to get a new link
          </Link>
        )}
      </div>
    );
  }

  if (verify.isSuccess) {
    return (
      <div className="auth__form" role="status">
        <LuCircleCheck size={32} aria-hidden style={{ color: 'var(--ok)' }} />
        <h2>Email confirmed</h2>
        <p className="muted">
          {verify.data.email} is verified. You can now {verify.data.role === 'CREATOR' ? 'accept' : 'place'} orders.
        </p>
        {user ? (
          <Link to={homePath(user)} className="btn btn--primary btn--block">
            Continue
          </Link>
        ) : (
          <Link to="/login" className="btn btn--primary btn--block">
            Log in
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="auth__form" aria-busy="true">
      <h2>Confirming your email…</h2>
      <div className="skeleton" style={{ height: 46 }} />
    </div>
  );
}

function CheckInbox() {
  const { user } = useAuth();
  const resend = useResendVerification();
  const [sent, setSent] = useState(0);

  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to={homePath(user)} replace />;

  return (
    <div className="auth__form">
      <LuMail size={32} aria-hidden />
      <h2>Check your inbox</h2>
      <p className="muted">
        We sent a confirmation link to <strong>{user.email}</strong>. It works for 24 hours. You can look around meanwhile, but you need to confirm
        before you {user.role === 'CREATOR' ? 'accept' : 'place'} orders.
      </p>
      <FormError>{resend.error?.message}</FormError>
      {sent > 0 && (
        <div className="alert alert--info" role="status">
          New link sent. Older links no longer work.
        </div>
      )}
      <DemoInbox key={sent} to={user.email} />
      <Button variant="secondary" block loading={resend.isPending} onClick={() => resend.mutate(undefined, { onSuccess: () => setSent((n) => n + 1) })}>
        Send a new link
      </Button>
      <Link to={homePath(user)} className="btn btn--ghost btn--block">
        Continue without confirming
      </Link>
    </div>
  );
}
