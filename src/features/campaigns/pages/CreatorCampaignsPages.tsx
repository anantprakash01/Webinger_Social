/** Creator side of campaigns (FR-41): /creator/campaigns (open + mine) and /creator/campaigns/:id (apply). */
import { TabRow } from '@/components/feedback';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowLeft } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { Button, Card, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton, Select, TextArea, cx } from '@/components/ui';
import { NICHE_LABEL, NICHES, PLATFORM_LABEL, PLATFORMS } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { applyServerErrors } from '@/lib/forms';
import { ApiError, type ApplicationInput, type CampaignDetail } from '@/types';
import { ApplicationBadge, CampaignCard, CampaignStatusBadge, formatDeadline } from '../components/CampaignParts';
import { useApply, useCampaign, useCampaigns, useWithdrawApplication } from '../hooks';
import { applicationFormSchema, type ApplicationFormValues } from '../schemas';

export function CreatorCampaignsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'open';
  const platform = params.get('platform') ?? undefined;
  const niche = params.get('niche') ?? undefined;
  const { user } = useAuth();
  const approved = user?.creator?.vettingStatus === 'APPROVED';
  const query = tab === 'mine' ? { applied: true } : { platform, niche };
  const { data, isPending, isError, error, refetch } = useCampaigns(query);
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Creator workspace" title="Campaigns" />
      {!approved && (
        <div className="vetting vetting--info" role="status">
          <div>
            <strong>You can browse campaigns now.</strong> Applying opens once your profile is approved.
          </div>
        </div>
      )}
      <div className="campaign-filters">
        <TabRow label="Campaign list">
          <button type="button" className={cx('platform-tab', tab === 'open' && 'is-on')} aria-pressed={tab === 'open'} onClick={() => set({ tab: undefined })}>
            Open campaigns
          </button>
          <button type="button" className={cx('platform-tab', tab === 'mine' && 'is-on')} aria-pressed={tab === 'mine'} onClick={() => set({ tab: 'mine', platform: undefined, niche: undefined })}>
            My applications
          </button>
        </TabRow>
        {tab === 'open' && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Select label="Platform" hideLabel value={platform} onChange={(v) => set({ platform: v })} options={PLATFORMS} allLabel="Any platform" />
            <Select label="Niche" hideLabel value={niche} onChange={(v) => set({ niche: v })} options={NICHES} allLabel="Any niche" />
          </div>
        )}
      </div>
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'mine' ? 'No applications yet' : 'No open campaigns match'}>
            {tab === 'mine' ? 'Applications you send appear here with their status.' : 'Try another platform or niche, or check back soon.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="campaign-grid">
          {data.content.map((c) => (
            <CampaignCard key={c.id} c={c} role="CREATOR" href={`/creator/campaigns/${c.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CreatorCampaignDetailPage() {
  const { id = '' } = useParams();
  const { data: c, isPending, isError, error, refetch } = useCampaign(id);
  if (isPending) return <PageSkeleton />;
  if (isError) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {error instanceof ApiError && error.status === 404 ? (
          <Card>
            <EmptyState title="This campaign is no longer open">
              <Link to="/creator/campaigns" className="link">
                Browse open campaigns
              </Link>
            </EmptyState>
          </Card>
        ) : (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }
  return (
    <div className="page">
      <Link to="/creator/campaigns" className="link small back-link">
        <LuArrowLeft aria-hidden /> All campaigns
      </Link>
      <div className="order__head">
        <div className="order__title">
          <div className="page__eyebrow">
            <CampaignStatusBadge c={c} />
          </div>
          <h1 className="page__title">{c.title}</h1>
        </div>
        <div className="order__party">
          <CreatorPhoto name={c.brand.name} url={c.brand.photoUrl} seed={c.brand.name} size={40} className="order__photo" />
          <div>
            <div className="list__meta">Brand</div>
            <div className="list__title">{c.brand.name}</div>
          </div>
        </div>
      </div>
      <div className="order__layout">
        <div className="order__main">
          <Card title="Brief">
            <p className="brief__text">{c.brief}</p>
          </Card>
          <Card title="Deliverables">
            <ul className="package__deliverables">
              {c.deliverables.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Card>
        </div>
        <aside className="order__side">
          <Card title="Details">
            <dl className="money">
              <dt>Budget per creator</dt>
              <dd>Up to {formatMoney(c.budgetPerCreatorCents, c.currency)}</dd>
              <dt>Apply by</dt>
              <dd>{formatDeadline(c.deadline)}</dd>
              <dt>Platforms</dt>
              <dd>{c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}</dd>
              <dt>Niches</dt>
              <dd>{c.niches.map((n) => NICHE_LABEL[n]).join(', ')}</dd>
            </dl>
          </Card>
          <ApplyCard c={c} />
        </aside>
      </div>
    </div>
  );
}

function ApplyCard({ c }: { c: CampaignDetail }) {
  const { user } = useAuth();
  const apply = useApply(c.id);
  const withdraw = useWithdrawApplication();
  const [formError, setFormError] = useState<string | null>(null);
  const mine = c.myApplication && c.myApplication.status !== 'WITHDRAWN' ? c.myApplication : null;
  const { register, handleSubmit, setError, formState } = useForm<ApplicationFormValues, unknown, ApplicationInput>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: { pitch: '', price: String(c.budgetPerCreatorCents / 100), deliveryDays: '7' },
  });
  const { errors } = formState;

  if (mine) {
    return (
      <Card title="Your application">
        <div className="form-stack">
          <ApplicationBadge status={mine.status} />
          <p className="small">{mine.pitch}</p>
          <p className="small">
            <strong>{formatMoney(mine.priceCents, mine.currency)}</strong> · {mine.deliveryDays}-day delivery
          </p>
          {mine.status === 'ACCEPTED' && mine.orderId && (
            <Link to={`/creator/orders/${mine.orderId}`} className="btn btn--primary btn--sm" style={{ justifySelf: 'start' }}>
              Open the order
            </Link>
          )}
          {mine.status === 'PENDING' && (
            <Button variant="ghost" size="sm" loading={withdraw.isPending} onClick={() => withdraw.mutate(mine.id)} style={{ justifySelf: 'start' }}>
              Withdraw application
            </Button>
          )}
          <FormError>{withdraw.error?.message}</FormError>
        </div>
      </Card>
    );
  }
  if (!c.open) return null;
  if (user?.creator?.vettingStatus !== 'APPROVED') {
    return (
      <Card title="Apply">
        <p className="small muted">Applying opens once our team approves your profile.</p>
      </Card>
    );
  }

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await apply.mutateAsync(v);
    } catch (e) {
      const msg = applyServerErrors(e, setError, ['pitch', 'deliveryDays']);
      const fe = (e as { fieldErrors?: Array<{ field: string; message: string }> }).fieldErrors ?? [];
      for (const x of fe) if (x.field === 'priceCents') setError('price', { message: x.message });
      setFormError(fe.length ? null : msg);
    }
  });

  return (
    <Card title="Apply">
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <FormError>{formError}</FormError>
        <TextArea label="Your pitch" rows={5} placeholder="Why you're a good fit, what you'd make, past results." error={errors.pitch?.message} {...register('pitch')} />
        <div className="form-row">
          <Input label="Your price (USD)" inputMode="decimal" hint={`Budget up to ${formatMoney(c.budgetPerCreatorCents, c.currency, { whole: true })}.`} error={errors.price?.message} {...register('price')} />
          <Input label="Delivery (days)" inputMode="numeric" error={errors.deliveryDays?.message} {...register('deliveryDays')} />
        </div>
        <Button type="submit" loading={apply.isPending}>
          Send application
        </Button>
        <p className="small muted">If the brand chooses you, an order is created and you have 72 hours to accept it.</p>
      </form>
    </Card>
  );
}
