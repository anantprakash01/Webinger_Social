/**
 * Phase E: "Get started" checklist for new brands on the dashboard. Hidden once everything is done, or
 * when dismissed (a per-browser preference in localStorage; it simply shows again if storage is unavailable).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuX } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Button, Card, Progress, cx } from '@/components/ui';
import { useSavedLists } from '@/features/retention/hooks';
import type { BrandStats } from '@/types';
import { useBrandProfile } from '../hooks';

const key = (userId: string) => `wc.setupDismissed.${userId}`;
const readDismissed = (userId: string) => {
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
};

export function SetupChecklist({ stats }: { stats: BrandStats }) {
  const { user } = useAuth();
  const profile = useBrandProfile();
  const lists = useSavedLists();
  const [dismissed, setDismissed] = useState(() => (user ? readDismissed(user.id) : false));
  if (!user || dismissed || profile.isPending || lists.isPending) return null;

  const orders = Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0);
  const steps = [
    { done: user.emailVerified, label: 'Confirm your email', to: '/verify-email' },
    { done: !!profile.data?.companyName && !!profile.data?.website, label: 'Add company details and logo', to: '/brand/profile' },
    { done: !!profile.data?.state, label: 'Add your state and GSTIN for tax invoices', to: '/brand/profile' },
    { done: (lists.data ?? []).some((l) => l.usernames.length > 0), label: 'Shortlist a creator in a saved list', to: '/search' },
    { done: orders > 0, label: 'Book your first package', to: '/search' },
    { done: stats.openCampaigns > 0 || stats.pendingApplications > 0, label: 'Post a campaign for creators to apply', to: '/brand/campaigns' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key(user.id), '1');
    } catch {
      /* ignore: it just shows again next time */
    }
    setDismissed(true);
  };

  return (
    <Card
      title="Get started"
      action={
        <Button variant="ghost" size="sm" icon onClick={dismiss} aria-label="Hide the setup checklist">
          <LuX aria-hidden />
        </Button>
      }
    >
      <div className="form-stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted">
            {doneCount} of {steps.length} done
          </span>
        </div>
        <Progress value={(doneCount / steps.length) * 100} label={`Setup ${doneCount} of ${steps.length} done`} />
        <ul className="checklist">
          {steps.map((s) => (
            <li key={s.label} className={cx('checklist__item', s.done && 'is-done')}>
              <span className="checklist__mark" aria-hidden>
                {s.done && <LuCheck />}
              </span>
              {s.done ? (
                <span>
                  {s.label}
                  <span className="sr-only"> (done)</span>
                </span>
              ) : (
                <Link to={s.to} className="link">
                  {s.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
