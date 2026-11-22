/**
 * `/` — hero with search, platform shortcuts, featured creators, how it works for both sides, join CTA.
 */
import { useT } from '@/lib/i18n';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuBadgeCheck, LuMessageSquare, LuRotateCcw, LuSearch, LuShieldCheck } from 'react-icons/lu';
import { PlatformIcon } from '@/components/creator';
import { Button } from '@/components/ui';
import { NICHES, PLATFORMS } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import type { CreatorCard as CreatorCardType } from '@/types';
import { CreatorCard, CreatorCardSkeleton, CreatorGrid } from '@/features/search/components/CreatorCard';
import { useCreatorSearch } from '@/features/search/hooks';

const POPULAR_NICHES = ['BEAUTY', 'FITNESS', 'FOOD', 'TECH', 'TRAVEL', 'FASHION', 'GAMING', 'PETS'] as const;

const PLATFORM_BLURB = {
  INSTAGRAM: 'Reels, Stories, feed posts',
  TIKTOK: 'Native videos and Spark Ads',
  YOUTUBE: 'Integrations, Shorts, dedicated videos',
  UGC: 'Ad-ready content for your channels',
} as const;

export function LandingPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  // "relevance" without a keyword ranks by rating weighted by review count, so one 5★ review doesn't top the list.
  // 11 = 3 for the hero cards + 8 different ones for the featured grid (no repeats; UX pass, item 18).
  const featured = useCreatorSearch({ sort: 'relevance', size: 11, page: 0 });
  const heroPicks = pickHero(featured.data?.content);
  const gridCreators = (featured.data?.content ?? []).filter((c) => !heroPicks.includes(c)).slice(0, 8);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  return (
    <>
      <section className="hero">
        <div className="hero__text">
          <h1>
            {t('Book creators.')} <em>{t('Pay when you approve.')}</em>
          </h1>
          <p>{t('Find vetted Instagram, TikTok, YouTube and UGC creators with prices up front. Your payment waits in escrow until you approve the work.')}</p>
          <form className="hero-search" role="search" onSubmit={submit}>
            <label htmlFor="hero-q" className="sr-only">
              {t('Search creators')}
            </label>
            <LuSearch aria-hidden className="hero-search__icon" />
            <input id="hero-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Try “skincare”, “fitness” or “Mumbai”')} />
            <Button type="submit">{t('Search')}</Button>
          </form>
          <div className="hero__tags" aria-label={t('Popular niches')}>
            {POPULAR_NICHES.map((n) => (
              <Link key={n} to={`/search?niche=${n.toLowerCase()}`} className="tag">
                {t(NICHES.find((x) => x.value === n)?.label ?? n)}
              </Link>
            ))}
          </div>
        </div>
        {!featured.isError && <HeroVisual picks={featured.data ? heroPicks : undefined} />}
      </section>

      <section className="section" aria-labelledby="platforms-h">
        <h2 id="platforms-h" className="section__title">
          {t('Browse by platform')}
        </h2>
        <div className="platform-tiles">
          {PLATFORMS.map((p) => (
            <Link key={p.value} to={`/search?platform=${p.value.toLowerCase()}`} className="platform-tile">
              <PlatformIcon platform={p.value} size={26} />
              <span className="platform-tile__name">{p.label}</span>
              <span className="small muted">{t(PLATFORM_BLURB[p.value])}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="featured-h">
        <div className="section-head">
          <h2 id="featured-h" className="section__title">
            {t('Featured creators')}
          </h2>
          <Link to="/search" className="link small">
            {t('See all')} <LuArrowRight aria-hidden style={{ verticalAlign: 'middle' }} />
          </Link>
        </div>
        {featured.isError ? (
          <p className="muted small">Featured creators could not load. <Link to="/search" className="link">Browse all creators</Link>.</p>
        ) : (
          <CreatorGrid featured busy={featured.isPending}>
            {featured.isPending
              ? Array.from({ length: 4 }, (_, i) => <CreatorCardSkeleton key={i} />)
              : gridCreators.map((c) => <CreatorCard key={c.username} creator={c} />)}
          </CreatorGrid>
        )}
      </section>

      <section className="section" aria-labelledby="how-h">
        <h2 id="how-h" className="section__title">
          {t('How it works')}
        </h2>
        <div className="how">
          <HowColumn
            title={t('For brands')}
            steps={[
              ['Search', 'Filter by platform, niche, location, followers and price. Every creator is vetted.'],
              ['Buy a package', 'Add your brief and pay by UPI, card, netbanking or wallet. It’s held, not charged, until the creator accepts.'],
              ['Approve and release', 'Review the delivery, ask for up to 2 revisions, then approve to pay.'],
            ]}
            cta={{ to: '/search', label: t('Find creators') }}
          />
          <HowColumn
            title={t('For creators')}
            steps={[
              ['Build your profile', 'Add your socials, portfolio and priced packages in about 15 minutes.'],
              ['Get orders', 'Brands buy your packages or send custom offers. Accept within 72 hours.'],
              ['Get paid', 'Payment is secured before you start and released when the brand approves.'],
            ]}
            cta={{ to: '/signup?role=creator', label: t('Join as a creator') }}
          />
        </div>
      </section>

      <Trust />

      <section className="cta-band" aria-labelledby="cta-h">
        <div>
          <h2 id="cta-h">{t('Are you a creator?')}</h2>
          <p>{t('List your packages and get paid safely for every collaboration. Joining is free.')}</p>
        </div>
        <Link to="/signup?role=creator" className="btn btn--primary">
          {t('Join as a creator')}
        </Link>
      </section>
    </>
  );
}

/**
 * Wide screens only: three featured creators as overlapping cards, plus an escrow badge that shows
 * the product's main promise. Uses the same query as the featured section, so no extra request.
 * The cards are real links to the profiles; only the shapes and the badge are decorative.
 */
/** Three creators for the hero; prefer ones with a photo, they make a better first impression. */
function pickHero(creators: CreatorCardType[] | undefined): CreatorCardType[] {
  return creators ? [...creators.filter((c) => c.photoUrl), ...creators.filter((c) => !c.photoUrl)].slice(0, 3) : [];
}

function HeroVisual({ picks: given }: { picks: CreatorCardType[] | undefined }) {
  const { t } = useT();
  const picks = given ?? [];
  const front = picks[1] ?? picks[0];
  return (
    <aside className="hero__visual" aria-label="Creators you can book">
      <span className="hero__blob" aria-hidden />
      <span className="hero__blob hero__blob--navy" aria-hidden />
      {[0, 1, 2].map((i) => (
        <div key={i} className={`hero__card hero__card--${i + 1}`}>
          {picks[i] ? <CreatorCard creator={picks[i]} /> : <CreatorCardSkeleton />}
        </div>
      ))}
      {front?.startingPriceCents != null && (
        <div className="hero__escrow" aria-hidden>
          <span className="hero__escrow-icon">
            <LuShieldCheck aria-hidden />
          </span>
          <span>
            <strong>{t('{amount} held in escrow', { amount: formatMoney(front.startingPriceCents, front.currency, { whole: true }) })}</strong>
            <span className="small muted">{t('Released to {name} when you approve', { name: front.displayName.split(' ')[0] })}</span>
          </span>
        </div>
      )}
    </aside>
  );
}

function HowColumn({ title, steps, cta }: { title: string; steps: Array<[string, string]>; cta: { to: string; label: string } }) {
  const { t } = useT();
  return (
    <div className="card how__col">
      <h3>{title}</h3>
      <ol className="how__steps">
        {steps.map(([step, d], i) => (
          <li key={step}>
            <span className="step__num" aria-hidden>
              {i + 1}
            </span>
            <div>
              <strong>{t(step)}</strong>
              <p className="small muted">{t(d)}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to={cta.to} className="btn btn--secondary btn--sm" style={{ justifySelf: 'start' }}>
        {cta.label}
      </Link>
    </div>
  );
}

const FAQ: Array<[string, string]> = [
  ['When am I charged?', 'Your payment (UPI, card, netbanking or wallet app) is held when you order and charged only when the creator accepts, within 72 hours. If they decline or don’t answer, the hold is released and you pay nothing.'],
  ['What if I’m not happy with the work?', 'You can ask for up to 2 revisions. If it still isn’t right, open a dispute within 72 hours of delivery: the money stays in escrow while our team reviews the brief, the chat and the delivery, and can refund you in full or in part.'],
  ['What do I pay on top of the price?', 'A service fee shown at checkout before you pay. There are no subscriptions or hidden costs.'],
  ['How are creators vetted?', 'Our team checks every profile and its linked social accounts before it appears in search. Verified accounts carry a badge.'],
  ['Can I talk to the creator first?', 'Each order has its own chat. Contact details stay hidden until the order is completed, so payments stay protected on the platform.'],
];

/** Trust and FAQ (UX pass, item 18): how escrow protects the brand, in plain words. */
function Trust() {
  const { t } = useT();
  return (
    <section className="section" aria-labelledby="trust-h">
      <h2 id="trust-h" className="section__title">
        {t('Your money is protected')}
      </h2>
      <div className="trust">
        <div className="trust__item">
          <LuShieldCheck aria-hidden />
          <h3>{t('Held in escrow')}</h3>
          <p className="small muted">{t('We hold the payment until you approve the delivery. The creator knows the money is there; you know it isn’t released early.')}</p>
        </div>
        <div className="trust__item">
          <LuBadgeCheck aria-hidden />
          <h3>{t('Vetted creators')}</h3>
          <p className="small muted">{t('Every profile and social account is checked by our team before brands can book it.')}</p>
        </div>
        <div className="trust__item">
          <LuRotateCcw aria-hidden />
          <h3>{t('Revisions and refunds')}</h3>
          <p className="small muted">{t('Up to 2 revisions per order, and a dispute process with full or partial refunds if something goes wrong.')}</p>
        </div>
        <div className="trust__item">
          <LuMessageSquare aria-hidden />
          <h3>{t('Everything in one place')}</h3>
          <p className="small muted">{t('Brief, chat, deliveries and receipts live with the order, so nothing gets lost in email.')}</p>
        </div>
      </div>
      <div className="faq">
        <h3 className="faq__title">{t('Questions brands ask')}</h3>
        {FAQ.map(([q, a]) => (
          <details key={q} className="faq__item">
            <summary>{t(q)}</summary>
            <p className="small">{t(a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
