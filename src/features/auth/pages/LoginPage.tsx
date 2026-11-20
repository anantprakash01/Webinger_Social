import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuInfo } from 'react-icons/lu';
import { isMock, takeSignOutReason } from '@/api/client';
import { DEMO_PASSWORD, demoAccounts } from '@/api/mock/demo';
import { canOpen, homePath } from '@/app/AuthContext';
import { Button, FormError, Input } from '@/components/ui';
import { applyServerErrors } from '@/lib/forms';
import { ApiError, ROLE_LABEL, type Me } from '@/types';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { PasswordField } from '../components/PasswordField';
import { useGoogleAuth, useLogin } from '../hooks';
import { loginFormSchema, type LoginForm } from '../schemas';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; notice?: string } | null;
  const [notice] = useState(() => takeSignOutReason() ?? state?.notice ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsSignup, setNeedsSignup] = useState(false);
  const login = useLogin();
  const google = useGoogleAuth();

  const { register, handleSubmit, setValue, setError, clearErrors, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = formState;

  const goHome = (user: Me) => {
    const from = state?.from;
    navigate(from && canOpen(user, from) ? from : homePath(user), { replace: true });
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    setNeedsSignup(false);
    try {
      goHome(await login.mutateAsync(v));
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['email', 'password']));
    }
  });

  const onGoogle = async () => {
    setFormError(null);
    setNeedsSignup(false);
    try {
      goHome(await google.mutateAsync({}));
    } catch (e) {
      setNeedsSignup(e instanceof ApiError && e.code === 'ROLE_REQUIRED');
      setFormError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
  };

  const fillDemo = (email: string) => {
    setValue('email', email);
    setValue('password', DEMO_PASSWORD);
    clearErrors();
    setFormError(null);
    setNeedsSignup(false);
  };

  return (
    <AuthLayout>
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        <div>
          <h2>Log in</h2>
          <p className="muted small">
            New here? <Link to="/signup" className="link">Create an account</Link>
          </p>
        </div>
        {notice && (
          <div className="alert alert--info" role="status">
            <LuInfo aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{notice}</span>
          </div>
        )}
        <FormError>
          {formError}
          {needsSignup && (
            <>
              {' '}
              <Link to="/signup" className="link">
                Sign up
              </Link>
            </>
          )}
        </FormError>
        <GoogleButton onClick={() => void onGoogle()} loading={google.isPending} />
        <div className="divider">or with email</div>
        <Input label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <PasswordField label="Password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="auth__links">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" block loading={login.isPending}>
          Log in
        </Button>

        {isMock && (
          <div>
            <p className="small muted" style={{ marginBottom: 8 }}>
              Demo accounts (password <code>{DEMO_PASSWORD}</code>):
            </p>
            <div className="demo-list">
              {demoAccounts.map((a) => (
                <button key={a.email} type="button" onClick={() => fillDemo(a.email)}>
                  <strong>{ROLE_LABEL[a.role]}</strong>
                  {a.note}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
