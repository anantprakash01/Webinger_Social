import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuBriefcase, LuCircleAlert, LuSparkles } from 'react-icons/lu';
import { homePath } from '@/app/AuthContext';
import { Button, FormError, Input } from '@/components/ui';
import { applyServerErrors } from '@/lib/forms';
import type { SignupRole } from '@/types';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { PasswordField } from '../components/PasswordField';
import { useGoogleAuth, useRegister } from '../hooks';
import { signupFormSchema, type SignupForm } from '../schemas';

const ROLES: Array<{ value: SignupRole; title: string; text: string; icon: typeof LuBriefcase }> = [
  { value: 'BRAND', title: "I'm a brand", text: 'Find and book creators', icon: LuBriefcase },
  { value: 'CREATOR', title: "I'm a creator", text: 'Sell packages, get paid', icon: LuSparkles },
];

const roleFromQuery = (v: string | null): SignupRole | undefined => (v === 'creator' ? 'CREATOR' : v === 'brand' ? 'BRAND' : undefined);

export function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const registerUser = useRegister();
  const google = useGoogleAuth();

  const { register, handleSubmit, control, setError, getValues, trigger, formState } = useForm<SignupForm>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { role: roleFromQuery(params.get('role')), name: '', email: '', password: '', acceptTerms: false as unknown as true },
  });
  const { errors } = formState;
  const password = useWatch({ control, name: 'password' }) ?? '';
  const role = useWatch({ control, name: 'role' });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync(v);
      navigate('/verify-email', { replace: true });
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['role', 'name', 'email', 'password', 'acceptTerms']));
    }
  });

  const onGoogle = async () => {
    setFormError(null);
    // A new Google account still needs the role choice (FR-01).
    if (!(await trigger('role'))) return;
    try {
      const user = await google.mutateAsync({ role: getValues('role') });
      navigate(homePath(user), { replace: true });
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['role']));
    }
  };

  const creator = role === 'CREATOR';

  return (
    <AuthLayout
      pageTitle="Sign up"
      title={creator ? 'Turn your audience into paid work.' : undefined}
      tagline={creator ? 'List your packages, accept orders, and get paid as soon as the brand approves.' : undefined}
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        <div>
          <h2>Create your account</h2>
          <p className="muted small">
            Already have one? <Link to="/login" className="link">Log in</Link>
          </p>
        </div>
        <FormError>{formError}</FormError>

        <fieldset className="role-choice" aria-invalid={errors.role ? true : undefined} aria-describedby={errors.role ? 'role-err' : undefined}>
          <legend>I want to join as</legend>
          <div className="role-choice__grid">
            {ROLES.map(({ value, title, text, icon: Icon }) => (
              <label key={value} className="role-card">
                <input type="radio" value={value} {...register('role')} />
                <span className="role-card__title">
                  <Icon aria-hidden /> {title}
                </span>
                <span className="role-card__text">{text}</span>
              </label>
            ))}
          </div>
          {errors.role && (
            <span id="role-err" className="field__error">
              <LuCircleAlert aria-hidden /> {errors.role.message}
            </span>
          )}
        </fieldset>

        <GoogleButton onClick={() => void onGoogle()} loading={google.isPending} label="Sign up with Google" />
        <div className="divider">or with email</div>

        <Input label={creator ? 'Your name' : 'Your full name'} autoComplete="name" error={errors.name?.message} {...register('name')} />
        <Input label={creator ? 'Email' : 'Work email'} type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <PasswordField label="Password" autoComplete="new-password" error={errors.password?.message} rulesFor={password} {...register('password')} />

        <div className="field">
          <label className="check small">
            <input type="checkbox" {...register('acceptTerms')} aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? 'terms-err' : undefined} />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener" className="link">
                Terms of use
              </a>{' '}
              and consent to the processing of my data as described in the{' '}
              <a href="/privacy" target="_blank" rel="noopener" className="link">
                Privacy notice
              </a>
              , including that payments go through the platform.
            </span>
          </label>
          {errors.acceptTerms && (
            <span id="terms-err" className="field__error">
              <LuCircleAlert aria-hidden /> {errors.acceptTerms.message}
            </span>
          )}
        </div>

        <Button type="submit" block loading={registerUser.isPending}>
          Create account
        </Button>
        <p className="small muted">We'll email you a link to confirm your address. You need it before you can {creator ? 'accept' : 'place'} orders.</p>
      </form>
    </AuthLayout>
  );
}
