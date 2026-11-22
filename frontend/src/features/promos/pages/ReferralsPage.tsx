/**
 * /referrals — "Refer and earn" for brands and creators (v3.3).
 * Brands: the invited brand gets ₹500 credit; you get ₹1,000 credit after their first completed order.
 * Creators: you get a ₹500 balance bonus after the creator you invited completes a first order.
 */
import { useQuery } from '@tanstack/react-query';
import { LuCopy, LuGift, LuShare2 } from 'react-icons/lu';
import { api } from '@/api/client';
import { toast } from '@/components/feedback';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { CreditEntry } from '@/types';

const CREDIT_REASON: Record<CreditEntry['reason'], string> = {
  REFERRAL_WELCOME: 'Welcome credit',
  REFERRAL_REWARD: 'Referral reward',
  ORDER_USED: 'Used on an order',
  ORDER_RETURNED: 'Returned',
  ADMIN_GRANT: 'Added by support',
};

export function ReferralsPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['me', 'referrals'], queryFn: () => api.me.referrals() });
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  const r = data;
  const brand = r.role === 'BRAND';
  const link = `${window.location.origin}${r.shareUrl}`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast(`Copy failed — select the ${what.toLowerCase()} and copy it`, 'error');
    }
  };
  const share = async () => {
    const text = brand
      ? `Book vetted Indian creators with escrow on Webinger Collab. Sign up with my code ${r.code} and get ${formatMoney(r.refereeRewardCents)} off your first booking.`
      : `Join Webinger Collab as a creator: list your packages and get paid through escrow. Use my code ${r.code} when you sign up.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Webinger Collab', text, url: link });
      } catch {
        /* closed the share sheet */
      }
    } else void copy(`${text} ${link}`, 'Invite');
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Refer and earn" />
      <Card>
        <div className="form-stack">
          <p style={{ margin: 0 }}>
            <LuGift aria-hidden style={{ verticalAlign: 'middle' }} />{' '}
            {brand ? (
              <>
                Invite another brand: they get <strong>{formatMoney(r.refereeRewardCents)}</strong> off, and you get <strong>{formatMoney(r.referrerRewardCents)}</strong> credit when their first order is completed.
              </>
            ) : (
              <>
                Invite another creator: you get a <strong>{formatMoney(r.referrerRewardCents)}</strong> bonus in your balance when they complete their first order.
              </>
            )}
          </p>
          <div className="referral-code">
            <span className="referral-code__value" aria-label={`Your code ${r.code.split('').join(' ')}`}>
              {r.code}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void copy(r.code, 'Code')}>
              <LuCopy aria-hidden /> Copy code
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void copy(link, 'Link')}>
              <LuCopy aria-hidden /> Copy link
            </Button>
            <Button size="sm" onClick={() => void share()}>
              <LuShare2 aria-hidden /> Share
            </Button>
          </div>
          <ol className="referral-steps">
            <li>Share your code or link.</li>
            <li>They sign up as a {brand ? 'brand' : 'creator'} with it.</li>
            <li>When their first order is completed, you get your reward{brand ? ' as credit for your next booking' : ' in your balance'}.</li>
          </ol>
        </div>
      </Card>

      <div className="grid grid--stats">
        {brand && <Stat label="Credit available" value={formatMoney(r.creditBalanceCents)} hint="Use it at checkout" accent />}
        <Stat label="People invited" value={r.referred.length} hint={`${r.referred.filter((x) => x.status === 'REWARDED').length} rewarded`} />
        <Stat label="Earned so far" value={formatMoney(r.earnedCents)} />
      </div>

      <Card title="People you invited">
        {r.referred.length === 0 ? (
          <EmptyState title="No one yet">Share your code to get started.</EmptyState>
        ) : (
          <ul className="list">
            {r.referred.map((p) => (
              <li key={`${p.name}-${p.joinedAt}`} className="list__item">
                <div className="list__main">
                  <div className="list__title">{p.name}</div>
                  <div className="list__meta">Joined {formatDate(p.joinedAt)}</div>
                </div>
                {p.status === 'REWARDED' ? <Badge tone="ok">+{formatMoney(p.rewardCents ?? 0)}</Badge> : <Badge>Waiting for first order</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {brand && r.credits.length > 0 && (
        <Card title="Credit history">
          <ul className="list">
            {r.credits.map((c) => (
              <li key={c.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{CREDIT_REASON[c.reason]}</div>
                  <div className="list__meta">
                    {c.note} · {formatDate(c.createdAt)}
                  </div>
                </div>
                <strong className={c.deltaCents > 0 ? 'money__discount' : undefined}>
                  {c.deltaCents > 0 ? '+' : '−'}
                  {formatMoney(Math.abs(c.deltaCents))}
                </strong>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="small muted">
        Credits only reduce the price of bookings on {`Webinger Collab`}. They cannot be bought, withdrawn, transferred or exchanged for cash. Referral rewards are for real new accounts; we may withhold rewards for
        self-referrals or abuse.
      </p>
    </div>
  );
}
