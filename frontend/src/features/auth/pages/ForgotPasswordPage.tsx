import { useT } from '@/lib/i18n';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { LuArrowLeft, LuMail } from 'react-icons/lu';
import { Button, FormError, Input } from '@/components/ui';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from '../components/AuthLayout';
import { DemoInbox } from '../components/DemoInbox';
import { useForgotPassword } from '../hooks';
import { forgotPasswordFormSchema, type ForgotPasswordForm } from '../schemas';

/** FR-03: request a 30-minute reset link. Same answer whether or not the account exists. */
export function ForgotPasswordPage() {
  const { t } = useT();
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(email);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['email']));
    }
  });

  return (
    <AuthLayout title={t('Forgot your password?')} tagline={t("It happens. We'll email you a link to choose a new one.")}>
      {sentTo ? (
        <div className="auth__form" role="status">
          <LuMail size={32} aria-hidden />
          <h2>{t('Check your email')}</h2>
          <p className="muted">
            If <strong>{sentTo}</strong> has an account, we've sent a reset link. It works once and expires in 30 minutes.
          </p>
          <DemoInbox to={sentTo} emptyText="No email was sent. In the real system the answer is the same either way, so nobody can find out which emails have accounts." />
          <Button variant="secondary" block onClick={() => setSentTo(null)}>
            {t('Use a different email')}
          </Button>
          <Link to="/login" className="btn btn--ghost btn--block">
            <LuArrowLeft aria-hidden /> {t('Back to log in')}
          </Link>
        </div>
      ) : (
        <form className="auth__form" onSubmit={onSubmit} noValidate>
          <h2>{t('Reset your password')}</h2>
          <FormError>{formError}</FormError>
          <Input label={t('Email')} type="email" autoComplete="email" inputMode="email" autoFocus error={formState.errors.email?.message && t(formState.errors.email.message)} {...register('email')} />
          <Button type="submit" block loading={forgot.isPending}>
            {t('Email me a reset link')}
          </Button>
          <Link to="/login" className="btn btn--ghost btn--block">
            <LuArrowLeft aria-hidden /> {t('Back to log in')}
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
