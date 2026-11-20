/** Public pages. Week 1 stubs; Week 2 builds landing, search and profile for real. */
import { Link, useParams } from 'react-router-dom';
import { LuSearch } from 'react-icons/lu';
import { Card } from '@/components/ui';
import { Placeholder } from './Placeholder';

export function LandingPage() {
  return (
    <>
      <section className="hero">
        <h1>
          Book creators. <em>Pay when you approve.</em>
        </h1>
        <p>Find vetted Instagram, TikTok, YouTube and UGC creators with prices up front. Your payment waits in escrow until you approve the work.</p>
        <div className="hero__actions">
          <Link to="/search" className="btn btn--primary">
            <LuSearch aria-hidden /> Find creators
          </Link>
          <Link to="/signup?role=creator" className="btn btn--secondary">
            Join as a creator
          </Link>
        </div>
      </section>
      <section className="section" aria-labelledby="how">
        <h2 id="how" style={{ fontSize: 'var(--fs-xl)' }}>
          How it works
        </h2>
        <div className="steps">
          {[
            ['Search', 'Filter by platform, niche, location, followers and price.'],
            ['Buy a package', 'Your card is held, not charged, until the creator accepts.'],
            ['Approve and release', 'Approve the delivery and the creator is paid. No action in 72 h approves it for you.'],
          ].map(([t, d], i) => (
            <Card key={t}>
              <div style={{ display: 'grid', gap: 8 }}>
                <span className="step__num">{i + 1}</span>
                <strong>{t}</strong>
                <span className="small muted">{d}</span>
              </div>
            </Card>
          ))}
        </div>
        <p className="small muted">Full landing page with featured creators arrives in Week 2.</p>
      </section>
    </>
  );
}

export const SearchPage = () => <Placeholder title="Find creators" week={2} frs={['FR-20', 'FR-21', 'FR-22', 'FR-23', 'FR-24']} />;

export function CreatorProfilePage() {
  const { username } = useParams();
  return <Placeholder eyebrow="Creator profile" title={`@${username}`} week={2} frs={['FR-15']} />;
}
