/**
 * Vetting status banner (FR-16). In the creator workspace it shows for every status except APPROVED;
 * the dashboard can also show the APPROVED state with `showApproved`.
 */
import { Link, useLocation } from 'react-router-dom';
import { LuCircleCheck, LuClock, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import type { VettingStatus } from '@/types';

export function VettingBanner({ status, reason, username, showApproved }: { status: VettingStatus; reason?: string | null; username?: string | null; showApproved?: boolean }) {
  const { pathname } = useLocation();
  const onOnboarding = pathname.startsWith('/creator/onboarding');

  if (status === 'APPROVED') {
    if (!showApproved) return null;
    return (
      <div className="vetting vetting--ok" role="status">
        <LuCircleCheck aria-hidden />
        <div>
          <strong>Your profile is live.</strong> Brands can find you in search
          {username && (
            <>
              {' '}
              and at{' '}
              <Link to={`/u/${username}`} className="link">
                /u/{username}
              </Link>
            </>
          )}
          .
        </div>
      </div>
    );
  }

  if (status === 'PENDING_REVIEW') {
    return (
      <div className="vetting vetting--info" role="status">
        <LuClock aria-hidden />
        <div>
          <strong>Your profile is with our team.</strong> We check every creator before they appear in search, and email you when
          it's done. You can keep editing meanwhile.
        </div>
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <div className="vetting vetting--warn" role="status">
        <LuTriangleAlert aria-hidden />
        <div>
          <strong>Your profile needs changes before it can go live.</strong>
          {reason && <span className="vetting__reason">Our team's note: “{reason}”</span>}
          {!onOnboarding && (
            <Link to="/creator/onboarding?step=review" className="link">
              Fix and resubmit
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="vetting vetting--neutral" role="status">
      <LuInfo aria-hidden />
      <div>
        <strong>Your profile is a draft.</strong> Brands can't see it yet. Finish setting it up and send it for review.
        {!onOnboarding && (
          <>
            {' '}
            <Link to="/creator/onboarding" className="link">
              Continue setup
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
