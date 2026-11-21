/**
 * /u/:username — public creator profile (FR-15). Works logged out; buying asks to log in as a brand.
 */
import { Link, useParams } from 'react-router-dom';
import { LuCalendar, LuCheck, LuClock, LuExternalLink, LuEye, LuLanguages, LuMapPin, LuPlay, LuSend, LuShieldCheck } from 'react-icons/lu';
import { CreatorPhoto, PlatformIcon, PlatformLabel, Rating, Stars, VerifiedBadge, placeLabel } from '@/components/creator';
import { VettingBadge } from '@/components/status';
import { useAuth } from '@/app/AuthContext';
import { ReportButton } from '@/features/admin/components/ReportButton';
import { Badge, Button, Card, EmptyState, ErrorState } from '@/components/ui';
import { formatCompact, LANGUAGE_LABEL, NICHE_LABEL, PLATFORM_LABEL } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { ApiError, type CreatorProfile, type Package, type PortfolioItem, type Review } from '@/types';
import { useCreatorProfile, usePurchaseActions } from '../hooks';

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function CreatorProfilePage() {
  const { username = '' } = useParams();
  const { data, isPending, isError, error, refetch } = useCreatorProfile(username);

  if (isPending) return <ProfileSkeleton />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="page" style={{ maxWidth: 640 }}>
          <Card>
            <div className="state">
              <div className="state__title">Creator not found</div>
              <div className="small">There is no live profile at @{username}. It may have been renamed or is not public yet.</div>
              <Link to="/search" className="btn btn--secondary btn--sm">
                Browse creators
              </Link>
            </div>
          </Card>
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  }
  return <Profile p={data} />;
}

function Profile({ p }: { p: CreatorProfile }) {
  const actions = usePurchaseActions(p.username);
  const { user } = useAuth();
  // FR-85: any signed-in brand or other creator can report a profile.
  const canReport = !!user && user.role !== 'ADMIN' && user.creator?.username !== p.username;
  const place = placeLabel(p.city, p.country);

  return (
    <div className="profile">
      {p.vettingStatus !== 'APPROVED' && (
        <div className="note note--warn profile__preview" role="status">
          <LuEye aria-hidden />
          <div>
            <strong>Preview.</strong> This profile is not public yet — only you and our team can see it. Status: <VettingBadge status={p.vettingStatus} />
          </div>
        </div>
      )}

      <div className="profile__cover">
        {p.coverUrls[0] ? <img src={p.coverUrls[0]} alt="" /> : <div className="profile__cover-fallback" />}
      </div>

      <div className="page profile__page">
        <header className="profile__head">
          <CreatorPhoto name={p.displayName} url={p.photoUrl} seed={p.username} className="profile__photo" />
          <div className="profile__id">
            <h1 className="profile__name">
              {p.displayName} {p.verified && <VerifiedBadge withText />}
            </h1>
            <div className="profile__handle">@{p.username}</div>
            <div className="profile__facts">
              {place && (
                <span>
                  <LuMapPin aria-hidden /> {place}
                </span>
              )}
              {p.languages.length > 0 && (
                <span>
                  <LuLanguages aria-hidden /> {p.languages.map((l) => LANGUAGE_LABEL[l] ?? l).join(', ')}
                </span>
              )}
              <span>
                <LuCalendar aria-hidden /> Member since {monthYear(p.memberSince)}
              </span>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {p.niches.map((n) => (
                <Link key={n} to={`/search?niche=${n.toLowerCase()}`} className="tag">
                  {NICHE_LABEL[n]}
                </Link>
              ))}
              <Rating avg={p.ratingAvg} count={p.ratingCount} />
            </div>
          </div>
          <div className="profile__cta">
            <Button
              variant="secondary"
              disabled={!actions.canBuy}
              title={actions.reason ?? undefined}
              onClick={actions.startOffer}
            >
              <LuSend aria-hidden /> Send custom offer
            </Button>
            {canReport && <ReportButton targetType="CREATOR" targetId={p.username} what="this profile" />}
          </div>
        </header>

        <div className="profile__grid">
          <div className="profile__main">
            {p.bio && (
              <Card title="About">
                <p className="profile__bio">{p.bio}</p>
              </Card>
            )}

            <section aria-labelledby="packages-h" className="profile__section">
              <div className="section-head">
                <h2 id="packages-h">Packages</h2>
                <span className="small muted">
                  <LuShieldCheck aria-hidden style={{ verticalAlign: 'middle' }} /> Paid into escrow, released when you approve
                </span>
              </div>
              {actions.reason && <p className="small muted">{actions.reason}</p>}
              {p.packages.length === 0 ? (
                <Card>
                  <EmptyState title="No packages yet">Send a custom offer to work with {p.displayName.split(' ')[0]}.</EmptyState>
                </Card>
              ) : (
                <div className="packages">
                  {p.packages.map((k) => (
                    <PackageCard key={k.id} pkg={k} canBuy={actions.canBuy} onBuy={() => actions.buy(k.id)} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="portfolio-h" className="profile__section">
              <h2 id="portfolio-h">Portfolio</h2>
              {p.portfolio.length === 0 ? (
                <Card>
                  <EmptyState title="No portfolio items yet" />
                </Card>
              ) : (
                <PortfolioGrid items={p.portfolio} name={p.displayName} />
              )}
            </section>

            <section aria-labelledby="reviews-h" className="profile__section">
              <h2 id="reviews-h">Reviews</h2>
              <Reviews reviews={p.reviews} avg={p.ratingAvg} count={p.ratingCount} />
            </section>
          </div>

          <aside className="profile__side">
            <Card title="Audience">
              {p.socials.length === 0 ? (
                <p className="small muted">No linked accounts yet.</p>
              ) : (
                <ul className="list">
                  {p.socials.map((s) => (
                    <li key={s.id} className="list__item">
                      <span className="social-icon">
                        <PlatformIcon platform={s.platform} size={18} />
                      </span>
                      <div className="list__main">
                        <div className="list__title">
                          {PLATFORM_LABEL[s.platform]} {s.verified && <VerifiedBadge />}
                        </div>
                        <div className="list__meta">@{s.handle}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="list__title">{s.platform === 'UGC' ? '—' : formatCompact(s.followers)}</div>
                        <div className="list__meta">
                          {s.platform === 'UGC' ? 'Content only' : s.engagementRateBps !== null ? `${(s.engagementRateBps / 100).toFixed(1)}% eng.` : 'followers'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="How booking works">
              <ol className="how-list small">
                <li>Pick a package and add your brief. Your card is held, not charged.</li>
                <li>{p.displayName.split(' ')[0]} accepts within 72 hours, or the hold is released.</li>
                <li>Approve the delivery to release payment. You can ask for up to 2 revisions.</li>
              </ol>
            </Card>
          </aside>
        </div>
      </div>

    </div>
  );
}

function PackageCard({ pkg, canBuy, onBuy }: { pkg: Package; canBuy: boolean; onBuy: () => void }) {
  return (
    <article className="card package">
      <div className="package__top">
        <PlatformLabel platform={pkg.platform} />
        <span className="package__days">
          <LuClock aria-hidden /> {pkg.deliveryDays}-day delivery
        </span>
      </div>
      <h3 className="package__title">{pkg.title}</h3>
      <p className="small muted">{pkg.description}</p>
      {pkg.deliverables.length > 0 && (
        <ul className="package__deliverables">
          {pkg.deliverables.map((d) => (
            <li key={d}>
              <LuCheck aria-hidden /> {d}
            </li>
          ))}
        </ul>
      )}
      <div className="package__foot">
        <span className="package__price">{formatMoney(pkg.priceCents, pkg.currency)}</span>
        <Button onClick={onBuy} disabled={!canBuy} aria-label={`Buy ${pkg.title} for ${formatMoney(pkg.priceCents, pkg.currency)}`}>
          Buy
        </Button>
      </div>
    </article>
  );
}

function PortfolioGrid({ items, name }: { items: PortfolioItem[]; name: string }) {
  return (
    <ul className="portfolio">
      {items.map((it, i) =>
        it.type === 'IMAGE' ? (
          <li key={it.id} className="portfolio__item">
            <img src={it.url} alt={it.caption ?? `${name} portfolio image ${i + 1}`} loading="lazy" decoding="async" />
            {it.caption && <span className="portfolio__caption">{it.caption}</span>}
          </li>
        ) : (
          <li key={it.id} className="portfolio__item portfolio__item--video">
            <a href={it.url} target="_blank" rel="noopener noreferrer">
              <LuPlay size={28} aria-hidden />
              <span>{it.caption ?? 'Watch video'}</span>
              <LuExternalLink aria-hidden className="portfolio__ext" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ),
      )}
    </ul>
  );
}

function Reviews({ reviews, avg, count }: { reviews: Review[]; avg: number | null; count: number }) {
  if (count === 0 || avg === null) {
    return (
      <Card>
        <EmptyState title="No reviews yet">Reviews appear after completed orders.</EmptyState>
      </Card>
    );
  }
  return (
    <Card>
      <div className="reviews__summary">
        <span className="reviews__avg">{avg.toFixed(1)}</span>
        <div>
          <Stars value={Math.round(avg)} />
          <div className="small muted">
            {count} review{count === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <ul className="list reviews">
        {reviews.map((r) => (
          <li key={r.id} className="list__item review">
            <div className="list__main">
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Stars value={r.rating} />
                <strong className="small">{r.brandName}</strong>
                <span className="list__meta">{shortDate(r.createdAt)}</span>
              </div>
              {r.comment && <p className="review__text">{r.comment}</p>}
              {r.creatorReply && (
                <div className="review__reply">
                  <Badge>Creator reply</Badge> <span className="small">{r.creatorReply}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="profile" aria-busy="true" aria-label="Loading profile">
      <div className="profile__cover skeleton" />
      <div className="page profile__page">
        <div className="profile__head">
          <div className="skeleton profile__photo" />
          <div style={{ display: 'grid', gap: 8, flex: 1 }}>
            <div className="skeleton" style={{ height: 28, width: 'min(260px, 70%)' }} />
            <div className="skeleton" style={{ height: 16, width: 'min(180px, 50%)' }} />
          </div>
        </div>
        <div className="grid grid--2">
          <div className="skeleton" style={{ height: 220 }} />
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      </div>
    </div>
  );
}
