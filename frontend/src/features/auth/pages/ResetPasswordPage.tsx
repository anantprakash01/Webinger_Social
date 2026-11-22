import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, FormError } from '@/components/ui';
import { applyServerErrors } from '@/lib/forms';
import { ApiError } from '@/types';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { useResetPassword } from '../hooks';
import { resetPasswordFormSchema, type ResetPasswordForm } from '../schemas';

/** FR-03: choose a new password from the emailed link. Success signs out every session. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const { register, handleSubmit, control, setError, formState } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const password = useWatch({ control, name: 'password' }) ?? '';

  const onSubmit = handleSubmit(async (v) => {
    if (!token) return;
    setFormError(null);
    try {
      await reset.mutateAsync({ token, password: v.password });
      navigate('/login', { replace: true, state: { notice: 'Password changed. Log in with your new password.' } });
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'TOKEN_EXPIRED' || e.code === 'TOKEN_INVALID')) setLinkDead(true);
      setFormError(applyServerErrors(e, setError, ['password']));
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Choose a new password.">
        <div className="auth__form">
          <h2>This link is incomplete</h2>
          <p className="muted">Open the link from the email again, or ask for a new one.</p>
          <Link to="/forgot-password" className="btn btn--primary btn--block">
            Get a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password.">
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        <h2>Set a new password</h2>
        <FormError>{formError}</FormError>
        {linkDead ? (
          <Link to="/forgot-password" className="btn btn--primary btn--block">
            Get a new reset link
          </Link>
        ) : (
          <>
            <PasswordField label="New password" autoComplete="new-password" autoFocus error={formState.errors.password?.message} rulesFor={password} {...register('password')} />
            <PasswordField label="Confirm new password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
            <Button type="submit" block loading={reset.isPending}>
              Save new password
            </Button>
            <p className="small muted">You'll be signed out on every device and can log in with the new password.</p>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
