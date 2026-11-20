/**
 * `/` — hero with search, platform shortcuts, featured creators, how it works for both sides, join CTA.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuSearch } from 'react-icons/lu';
import { PlatformIcon } from '@/components/creator';
import { Button } from '@/components/ui';
import { NICHES, PLATFORMS } from '@/lib/catalog';
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
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  // "relevance" without a keyword ranks by rating weighted by review count, so one 5★ review doesn't top the list.
  const featured = useCreatorSearch({ sort: 'relevance', size: 8, page: 0 });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  return (
    <>
      <section className="hero">
        <h1>
          Book creators. <em>Pay when you approve.</em>
        </h1>
        <p>Find vetted Instagram, TikTok, YouTube and UGC creators with prices up front. Your payment waits in escrow until you approve the work.</p>
        <form className="hero-search" role="search" onSubmit={submit}>
          <label htmlFor="hero-q" className="sr-only">
            Search creators
          </label>
          <LuSearch aria-hidden className="hero-search__icon" />
          <input id="hero-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “skincare”, “fitness” or “Austin”" />
          <Button type="submit">Search</Button>
        </form>
        <div className="hero__tags" aria-label="Popular niches">
          {POPULAR_NICHES.map((n) => (
            <Link key={n} to={`/search?niche=${n.toLowerCase()}`} className="tag">
              {NICHES.find((x) => x.value === n)?.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="platforms-h">
        <h2 id="platforms-h" className="section__title">
          Browse by platform
        </h2>
        <div className="platform-tiles">
          {PLATFORMS.map((p) => (
            <Link key={p.value} to={`/search?platform=${p.value.toLowerCase()}`} className="platform-tile">
              <PlatformIcon platform={p.value} size={26} />
              <span className="platform-tile__name">{p.label}</span>
              <span className="small muted">{PLATFORM_BLURB[p.value]}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="featured-h">
        <div className="section-head">
          <h2 id="featured-h" className="section__title">
            Featured creators
          </h2>
          <Link to="/search" className="link small">
            See all <LuArrowRight aria-hidden style={{ verticalAlign: 'middle' }} />
          </Link>
        </div>
        {featured.isError ? (
          <p className="muted small">Featured creators could not load. <Link to="/search" className="link">Browse all creators</Link>.</p>
        ) : (
          <CreatorGrid featured busy={featured.isPending}>
            {featured.isPending
              ? Array.from({ length: 4 }, (_, i) => <CreatorCardSkeleton key={i} />)
              : featured.data.content.map((c) => <CreatorCard key={c.username} creator={c} />)}
          </CreatorGrid>
        )}
      </section>

      <section className="section" aria-labelledby="how-h">
        <h2 id="how-h" className="section__title">
          How it works
        </h2>
        <div className="how">
          <HowColumn
            title="For brands"
            steps={[
              ['Search', 'Filter by platform, niche, location, followers and price. Every creator is vetted.'],
              ['Buy a package', 'Add your brief. Your card is held, not charged, until the creator accepts.'],
              ['Approve and release', 'Review the delivery, ask for up to 2 revisions, then approve to pay.'],
            ]}
            cta={{ to: '/search', label: 'Find creators' }}
          />
          <HowColumn
            title="For creators"
            steps={[
              ['Build your profile', 'Add your socials, portfolio and priced packages in about 15 minutes.'],
              ['Get orders', 'Brands buy your packages or send custom offers. Accept within 72 hours.'],
              ['Get paid', 'Payment is secured before you start and released when the brand approves.'],
            ]}
            cta={{ to: '/signup?role=creator', label: 'Join as a creator' }}
          />
        </div>
      </section>

      <section className="cta-band" aria-labelledby="cta-h">
        <div>
          <h2 id="cta-h">Are you a creator?</h2>
          <p>List your packages and get paid safely for every collaboration. Joining is free.</p>
        </div>
        <Link to="/signup?role=creator" className="btn btn--primary">
          Join as a creator
        </Link>
      </section>
    </>
  );
}

function HowColumn({ title, steps, cta }: { title: string; steps: Array<[string, string]>; cta: { to: string; label: string } }) {
  return (
    <div className="card how__col">
      <h3>{title}</h3>
      <ol className="how__steps">
        {steps.map(([t, d], i) => (
          <li key={t}>
            <span className="step__num" aria-hidden>
              {i + 1}
            </span>
            <div>
              <strong>{t}</strong>
              <p className="small muted">{d}</p>
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
