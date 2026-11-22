/** Campaign card (lists) and the "new campaign" form (FR-40). */
import { ShortMoney } from '@/components/Money';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { LuCalendar, LuCrown, LuUsers } from 'react-icons/lu';
import { CreatorPhoto, PlatformIcon, Rating } from '@/components/creator';
import { Badge, Button, ChipGroup, FormError, Input, TextArea, type Tone } from '@/components/ui';
import { NICHE_LABEL, NICHES, PLATFORM_LABEL, PLATFORMS } from '@/lib/catalog';
import { applyServerErrors } from '@/lib/forms';
import type { ApplicationStatus, CampaignInput, CampaignSummary } from '@/types';
import { useCreateCampaign } from '../hooks';
import { campaignFormSchema, type CampaignFormValues } from '../schemas';
import { MAX_NICHES } from '@/features/creators/schemas';

export const formatDeadline = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const APP_STATUS: Record<ApplicationStatus, [Tone, string]> = {
  PENDING: ['warn', 'Applied — waiting'],
  ACCEPTED: ['ok', 'Accepted'],
  REJECTED: ['neutral', 'Not selected'],
  WITHDRAWN: ['neutral', 'Withdrawn'],
};
export const ApplicationBadge = ({ status }: { status: ApplicationStatus }) => <Badge tone={APP_STATUS[status][0]}>{APP_STATUS[status][1]}</Badge>;

export function CampaignStatusBadge({ c }: { c: Pick<CampaignSummary, 'status' | 'open'> }) {
  if (c.open) return <Badge tone="ok">Open</Badge>;
  return <Badge>{c.status === 'CLOSED' ? 'Closed' : 'Deadline passed'}</Badge>;
}

/** v3.2: paying brands get a badge creators can see. */
export function BrandPlanBadge({ plan }: { plan: CampaignSummary['brandPlan'] }) {
  if (plan === 'FREE') return null;
  return (
    <Badge tone="info">
      <span className="brand-plan-badge">
        <LuCrown aria-hidden /> {plan === 'PREMIUM' ? 'Premium brand' : 'Pro brand'}
      </span>
    </Badge>
  );
}

export function CampaignCard({ c, href, role }: { c: CampaignSummary; href: string; role: 'BRAND' | 'CREATOR' }) {
  return (
    <article className="card campaign-card">
      <Link to={href} className="campaign-card__link">
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {role === 'CREATOR' ? (
            <span className="row">
              <CreatorPhoto name={c.brand.name} url={c.brand.photoUrl} seed={c.brand.name} size={28} className="order__photo" />
              <span className="small">{c.brand.name}</span>
              <Rating avg={c.brandRating.ratingAvg} count={c.brandRating.ratingCount} />
              <BrandPlanBadge plan={c.brandPlan} />
            </span>
          ) : (
            <CampaignStatusBadge c={c} />
          )}
          {role === 'CREATOR' && c.myApplication && <ApplicationBadge status={c.myApplication.status} />}
          {role === 'CREATOR' && !c.myApplication && c.myInvite?.status === 'INVITED' && <Badge tone="info">Invited</Badge>}
        </div>
        <h3 className="campaign-card__title">{c.title}</h3>
        <div className="campaign-card__platforms">
          {c.platforms.map((p) => (
            <span key={p} className="platform-label">
              <PlatformIcon platform={p} /> {PLATFORM_LABEL[p]}
            </span>
          ))}
        </div>
        <div className="small muted">{c.niches.map((n) => NICHE_LABEL[n]).join(' · ')}</div>
        <div className="campaign-card__foot">
          <span>
            Up to <strong><ShortMoney cents={c.budgetPerCreatorCents} currency={c.currency} /></strong> per creator
          </span>
          <span className="small muted">
            <LuCalendar aria-hidden style={{ verticalAlign: 'middle' }} /> Apply by {formatDeadline(c.deadline)}
          </span>
          {role === 'BRAND' && (
            <span className="small">
              <LuUsers aria-hidden style={{ verticalAlign: 'middle' }} /> {c.applicationCount} application{c.applicationCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </Link>
    </article>
  );
}

export function CampaignForm({ onDone }: { onDone: (id: string) => void }) {
  const create = useCreateCampaign();
  const [formError, setFormError] = useState<string | null>(null);
  const [inTwoWeeks] = useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const { register, control, handleSubmit, setError, formState } = useForm<CampaignFormValues, unknown, CampaignInput>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: { title: '', brief: '', platforms: ['INSTAGRAM'], niches: [], deliverablesText: '', budget: '', deadline: inTwoWeeks },
  });
  const { errors } = formState;
  const brief = useWatch({ control, name: 'brief' }) ?? '';

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const c = await create.mutateAsync(v);
      onDone(c.id);
    } catch (e) {
      const msg = applyServerErrors(e, setError, ['title', 'brief', 'platforms', 'niches', 'deadline']);
      const fe = (e as { fieldErrors?: Array<{ field: string; message: string }> }).fieldErrors ?? [];
      for (const x of fe) {
        if (x.field === 'budgetPerCreatorCents') setError('budget', { message: x.message });
        if (x.field === 'deliverables') setError('deliverablesText', { message: x.message });
      }
      setFormError(fe.length ? null : msg);
    }
  });

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <FormError>{formError}</FormError>
      <Input label="Title" placeholder="e.g. Spring home refresh" error={errors.title?.message} {...register('title')} />
      <TextArea label="Brief" rows={5} placeholder="What you're launching, what to show, tone, dos and don'ts." error={errors.brief?.message} counter={{ value: brief.length, max: 4000 }} {...register('brief')} />
      <Controller
        control={control}
        name="platforms"
        render={({ field }) => <ChipGroup legend="Platforms" options={PLATFORMS} value={field.value} onChange={field.onChange} error={errors.platforms?.message} />}
      />
      <Controller
        control={control}
        name="niches"
        render={({ field }) => <ChipGroup legend="Niches" options={NICHES} value={field.value} onChange={field.onChange} max={MAX_NICHES} error={errors.niches?.message} />}
      />
      <TextArea label="Deliverables" rows={3} hint="One per line, e.g. “1 Reel (30–60 s)”." error={errors.deliverablesText?.message} {...register('deliverablesText')} />
      <div className="form-row">
        <Input label="Budget per creator (₹)" inputMode="decimal" placeholder="25000" hint="Creators propose their price up to about this." error={errors.budget?.message} {...register('budget')} />
        <Input label="Apply by" type="date" error={errors.deadline?.message} {...register('deadline')} />
      </div>
      <div className="row">
        <Button type="submit" loading={create.isPending}>
          Post campaign
        </Button>
      </div>
    </form>
  );
}
