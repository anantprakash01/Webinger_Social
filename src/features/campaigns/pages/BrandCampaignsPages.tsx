/** Brand side of campaigns: /brand/campaigns (list + new) and /brand/campaigns/:id (applications). */
import { toast, useConfirm } from '@/components/feedback';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuPlus } from 'react-icons/lu';
import { RequireVerified } from '@/app/guards';
import { CreatorPhoto, PlatformIcon, Rating } from '@/components/creator';
import { Button, Card, Drawer, EmptyState, ErrorState, FormError, PageHeader, PageSkeleton } from '@/components/ui';
import { formatCompact, NICHE_LABEL, PLATFORM_LABEL } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { ApiError, type Application } from '@/types';
import { ApplicationBadge, CampaignCard, CampaignForm, CampaignStatusBadge, formatDeadline } from '../components/CampaignParts';
import { useCampaign, useCampaigns, useCloseCampaign, useRejectApplication } from '../hooks';

export function BrandCampaignsPage() {
  const { data, isPending, isError, error, refetch } = useCampaigns();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHeader
        eyebrow="Brand workspace"
        title="Campaigns"
        actions={
          <Button onClick={() => setCreating(true)}>
            <LuPlus aria-hidden /> New campaign
          </Button>
        }
      />
      <p className="muted small">Post a brief and let approved creators apply with a pitch and a price. Accepting one places an order, just like buying a package.</p>
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No campaigns yet">Post your first campaign to get applications from creators.</EmptyState>
        </Card>
      ) : (
        <div className="campaign-grid">
          {data.content.map((c) => (
            <CampaignCard key={c.id} c={c} role="BRAND" href={`/brand/campaigns/${c.id}`} />
          ))}
        </div>
      )}
      <Drawer open={creating} onClose={() => setCreating(false)} title="New campaign">
        {creating && (
          <RequireVerified action="post campaigns">
            <CampaignForm
              onDone={(id) => {
                setCreating(false);
                navigate(`/brand/campaigns/${id}`);
              }}
            />
          </RequireVerified>
        )}
      </Drawer>
    </div>
  );
}

export function BrandCampaignDetailPage() {
  const { id = '' } = useParams();
  const { data: c, isPending, isError, error, refetch } = useCampaign(id);
  const close = useCloseCampaign(id);
  const confirm = useConfirm();

  if (isPending) return <PageSkeleton />;
  if (isError) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        {error instanceof ApiError && error.status === 404 ? (
          <Card>
            <EmptyState title="Campaign not found">
              <Link to="/brand/campaigns" className="link">
                Back to campaigns
              </Link>
            </EmptyState>
          </Card>
        ) : (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }
  const pending = c.applications.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="page">
      <Link to="/brand/campaigns" className="link small back-link">
        <LuArrowLeft aria-hidden /> All campaigns
      </Link>
      <PageHeader
        eyebrow={<CampaignStatusBadge c={c} />}
        title={c.title}
        actions={
          c.status === 'OPEN' ? (
            <Button
              variant="secondary"
              loading={close.isPending}
              onClick={async () => {
                const ok = await confirm.ask({
                  title: `Close “${c.title}”?`,
                  body: `Creators can no longer apply.${pending ? ` ${pending} pending application${pending === 1 ? ' is' : 's are'} declined.` : ''} Orders already placed continue.`,
                  confirmLabel: 'Close campaign',
                });
                if (ok) close.mutate(undefined, { onSuccess: () => toast('Campaign closed') });
              }}
            >
              Close campaign
            </Button>
          ) : undefined
        }
      />
      <div className="order__layout">
        <section className="order__main" aria-labelledby="apps-h">
          <h2 id="apps-h" className="section__title" style={{ fontSize: 'var(--fs-lg)' }}>
            Applications ({c.applications.length})
          </h2>
          {c.applications.length === 0 ? (
            <Card>
              <EmptyState title="No applications yet">Approved creators in your niches see this campaign in their workspace.</EmptyState>
            </Card>
          ) : (
            c.applications.map((a) => <ApplicationCard key={a.id} a={a} campaignId={c.id} budget={c.budgetPerCreatorCents} open={c.status === 'OPEN'} />)
          )}
        </section>
        <aside className="order__side">
          <Card title="Brief">
            <div className="form-stack">
              <p className="brief__text">{c.brief}</p>
              <ul className="package__deliverables">
                {c.deliverables.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <dl className="money">
                <dt>Budget per creator</dt>
                <dd>{formatMoney(c.budgetPerCreatorCents, c.currency)}</dd>
                <dt>Apply by</dt>
                <dd>{formatDeadline(c.deadline)}</dd>
                <dt>Platforms</dt>
                <dd>{c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}</dd>
                <dt>Niches</dt>
                <dd>{c.niches.map((n) => NICHE_LABEL[n]).join(', ')}</dd>
              </dl>
            </div>
          </Card>
        </aside>
      </div>
      {confirm.dialog}
    </div>
  );
}

function ApplicationCard({ a, campaignId, budget, open }: { a: Application; campaignId: string; budget: number; open: boolean }) {
  const reject = useRejectApplication();
  const navigate = useNavigate();
  return (
    <Card>
      <div className="application">
        <div className="application__head">
          <CreatorPhoto name={a.creator.name} url={a.creator.photoUrl} seed={a.creator.username ?? a.creator.name} size={44} className="order__photo" />
          <div style={{ minWidth: 0, flex: 1 }}>
            {a.creator.username ? (
              <Link to={`/u/${a.creator.username}`} className="list__title link">
                {a.creator.name}
              </Link>
            ) : (
              <div className="list__title">{a.creator.name}</div>
            )}
            <div className="row small muted" style={{ flexWrap: 'wrap' }}>
              {a.reach && (
                <span>
                  <PlatformIcon platform={a.reach.platform} /> {formatCompact(a.reach.followers)}
                </span>
              )}
              <Rating avg={a.ratingAvg ?? null} count={a.ratingCount ?? 0} />
            </div>
          </div>
          <ApplicationBadge status={a.status} />
        </div>
        <p className="small application__pitch">{a.pitch}</p>
        <div className="application__foot">
          <span>
            <strong>{formatMoney(a.priceCents, a.currency)}</strong>
            {a.priceCents > budget && <span className="small muted"> (above budget)</span>} · {a.deliveryDays}-day delivery
          </span>
          {a.status === 'PENDING' && open && (
            <span className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => navigate(`/checkout/campaign/${campaignId}/${a.id}`)}>
                Accept and pay
              </Button>
              <Button size="sm" variant="ghost" loading={reject.isPending && reject.variables === a.id} onClick={() => reject.mutate(a.id)}>
                Decline
              </Button>
            </span>
          )}
          {a.orderId && (
            <Link to={`/brand/orders/${a.orderId}`} className="link small">
              View order
            </Link>
          )}
        </div>
        <FormError>{reject.variables === a.id ? reject.error?.message : null}</FormError>
      </div>
    </Card>
  );
}
