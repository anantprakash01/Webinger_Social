import { ShortMoney } from '@/components/Money';
import { SaveToList } from '@/features/retention/components/BrandTools';
import { Link } from 'react-router-dom';
import { CreatorPhoto, PlatformIcon, Rating, VerifiedBadge, placeLabel } from '@/components/creator';
import { COUNTRY_LABEL, formatCompact, NICHE_LABEL, PLATFORM_LABEL } from '@/lib/catalog';
import type { CreatorCard as Card } from '@/types';

/** Search result card (FR-24): photo, name, top platform, followers, starting price, rating. */
/** Why a card matched a keyword search, when it isn't obvious from the name (UX pass, item 10). */
function matchReason(c: Card, q: string | undefined): string | null {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const nameHit = words.every((w) => `${c.displayName} ${c.username}`.toLowerCase().includes(w));
  if (nameHit) return null;
  const niche = c.niches.find((n) => words.some((w) => NICHE_LABEL[n].toLowerCase().includes(w)));
  if (niche) return `Matches niche: ${NICHE_LABEL[niche]}`;
  const place = `${c.city ?? ''} ${c.country ? (COUNTRY_LABEL[c.country] ?? '') : ''}`.toLowerCase();
  if (words.some((w) => place.includes(w))) return 'Matches location';
  return `Mentions “${q!.trim()}” in their bio`;
}

export function CreatorCard({ creator: c, q }: { creator: Card; q?: string }) {
  // Cards show the city only (the full place is on the profile); country when there is no city.
  const place = c.city ?? (c.country ? (COUNTRY_LABEL[c.country] ?? placeLabel(null, c.country)) : '');
  const why = matchReason(c, q);
  return (
    <article className="ccard">
      <Link to={`/u/${c.username}`} className="ccard__link">
        <div className="ccard__media">
          <CreatorPhoto name={c.displayName} url={c.photoUrl} seed={c.username} className="ccard__photo" pattern />
          {c.away && <span className="ccard__away">Away</span>}
          {c.reach && (
            <span className="ccard__reach">
              <PlatformIcon platform={c.reach.platform} size={14} />
              <span>
                {formatCompact(c.reach.followers)}
                <span className="sr-only"> followers on {PLATFORM_LABEL[c.reach.platform]}</span>
              </span>
            </span>
          )}
        </div>
        <div className="ccard__body">
          <h3 className="ccard__name">
            <span className="ccard__name-text">{c.displayName}</span>
            {c.verified && <VerifiedBadge />}
          </h3>
          <div className="ccard__meta">{place || `@${c.username}`}</div>
          {c.niches.length > 0 && <div className="ccard__niches">{c.niches.slice(0, 2).map((n) => NICHE_LABEL[n]).join(' · ')}</div>}
          {why && <div className="ccard__why">{why}</div>}
          <div className="ccard__foot">
            <span className="ccard__price">
              {c.startingPriceCents !== null ? (
                <>
                  From <strong><ShortMoney cents={c.startingPriceCents} currency={c.currency} /></strong>
                </>
              ) : (
                <span className="muted">No packages yet</span>
              )}
            </span>
            <Rating avg={c.ratingAvg} count={c.ratingCount} />
          </div>
        </div>
      </Link>
      <div className="ccard__save">
        <SaveToList username={c.username} name={c.displayName} compact />
      </div>
    </article>
  );
}

export function CreatorCardSkeleton() {
  return (
    <div className="ccard ccard--skeleton" aria-hidden>
      <div className="skeleton ccard__media" />
      <div className="ccard__body">
        <div className="skeleton" style={{ height: 18, width: '70%' }} />
        <div className="skeleton" style={{ height: 14, width: '50%' }} />
        <div className="skeleton" style={{ height: 14, width: '40%' }} />
      </div>
    </div>
  );
}

export function CreatorGrid({ children, busy, featured }: { children: React.ReactNode; busy?: boolean; featured?: boolean }) {
  return (
    <div className={featured ? 'creator-grid creator-grid--featured' : 'creator-grid'} aria-busy={busy || undefined}>
      {children}
    </div>
  );
}
