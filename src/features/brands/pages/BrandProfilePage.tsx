/** /brand/profile — company profile (FR-05): name, website, logo, industry, country. */
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DEFAULT_FEES } from '@/api/mock/fees';
import { useCurrentFees } from '@/features/admin/hooks';
import { Badge, Button, Card, ErrorState, FormError, Input, PageHeader, PageSkeleton } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { INDUSTRIES, LOCATIONS } from '@/lib/catalog';
import { applyServerErrors } from '@/lib/forms';
import type { BrandProfile, BrandProfileInput } from '@/types';
import { useBrandProfile, useSaveBrandProfile } from '../hooks';
import { brandProfileFormSchema, type BrandProfileForm } from '../schemas';

export function BrandProfilePage() {
  const { data, isPending, isError, error, refetch } = useBrandProfile();
  const fees = useCurrentFees().data ?? DEFAULT_FEES;
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHeader title="Company profile" />
      <div className="brand-profile">
        <Card>
          <BrandForm profile={data} />
        </Card>
        <Card title="Plan">
          <div className="row" style={{ marginBottom: 8 }}>
            <Badge tone="info">Free</Badge>
          </div>
          <p className="small muted">
            A {fees.brandFeeBps / 100}% service fee is added at checkout. Pro and Premium plans with lower fees are coming later.
          </p>
        </Card>
      </div>
    </div>
  );
}

const toFormValues = (p: BrandProfile): BrandProfileForm => ({
  companyName: p.companyName ?? '',
  website: p.website ?? '',
  logoUrl: p.logoUrl,
  industry: p.industry ?? ('' as BrandProfileForm['industry']),
  country: p.country ?? '',
});

function BrandForm({ profile }: { profile: BrandProfile }) {
  const save = useSaveBrandProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, reset, formState } = useForm<BrandProfileForm, unknown, BrandProfileInput>({
    resolver: zodResolver(brandProfileFormSchema),
    defaultValues: toFormValues(profile),
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      // The saved values become the new baseline, so the form is clean.
      reset(toFormValues(await save.mutateAsync(v)));
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['companyName', 'website', 'logoUrl', 'industry', 'country']));
    }
  });

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <p className="small muted">Creators see your company name and logo on offers and orders.</p>
      <FormError>{formError}</FormError>
      <Controller
        control={control}
        name="logoUrl"
        render={({ field }) => <ImagePicker label="Logo" purpose="BRAND_LOGO" shape="square" value={field.value ?? null} onChange={field.onChange} hint="Square images work best." />}
      />
      <Input label="Company name" autoComplete="organization" error={errors.companyName?.message} {...register('companyName')} />
      <Input label="Website" inputMode="url" placeholder="yourbrand.com" autoComplete="url" error={errors.website?.message} {...register('website')} />
      <div className="form-row">
        <div className="field">
          <label className="field__label" htmlFor="bp-industry">
            Industry
          </label>
          <select id="bp-industry" className="field__input" aria-invalid={errors.industry ? true : undefined} {...register('industry')}>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          {errors.industry && <span className="field__error">{errors.industry.message}</span>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="bp-country">
            Country
          </label>
          <select id="bp-country" className="field__input" aria-invalid={errors.country ? true : undefined} {...register('country')}>
            <option value="">Choose…</option>
            {LOCATIONS.map((l) => (
              <option key={l.country} value={l.country}>
                {l.label}
              </option>
            ))}
          </select>
          {errors.country && <span className="field__error">{errors.country.message}</span>}
        </div>
      </div>
      <div className="row">
        <Button type="submit" loading={save.isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
