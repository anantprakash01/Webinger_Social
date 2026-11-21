/**
 * /creator/onboarding — the setup wizard (target: a priced profile in under 15 minutes).
 * Steps: profile (FR-10) → socials (FR-11) → packages (FR-12/13) → portfolio (FR-14)
 *        → payouts (FR-62) → review and submit (FR-16).
 * The step lives in the URL (?step=…), so a refresh or the Stripe return lands on the same step.
 * After approval the same screens work as the profile editor.
 */
import { useSearchParams } from 'react-router-dom';
import { LuCheck } from 'react-icons/lu';
import { Card, ErrorState, PageHeader, PageSkeleton, Progress, cx } from '@/components/ui';
import type { CreatorChecklist, CreatorMe } from '@/types';
import { PackageManager } from '../components/PackageManager';
import { VettingBanner } from '../components/VettingBanner';
import { PayoutsStep } from '../components/onboarding/PayoutsStep';
import { PortfolioStep } from '../components/onboarding/PortfolioStep';
import { ProfileStep } from '../components/onboarding/ProfileStep';
import { ReviewStep } from '../components/onboarding/ReviewStep';
import { SocialsStep } from '../components/onboarding/SocialsStep';
import { StepNav } from '../components/onboarding/StepNav';
import { useMyCreator } from '../workspaceHooks';

export const STEPS = [
  { key: 'profile', label: 'Profile', check: (c: CreatorChecklist) => c.profile && c.photo, optional: false, intro: 'Who you are and what you make. Brands see this first.' },
  { key: 'socials', label: 'Social accounts', check: (c: CreatorChecklist) => c.socials, optional: false, intro: 'Link the accounts you post on. Our team verifies them during review.' },
  { key: 'packages', label: 'Packages', check: (c: CreatorChecklist) => c.packages, optional: false, intro: 'Priced offers brands can buy straight away. At least one, up to eight.' },
  { key: 'portfolio', label: 'Portfolio', check: (c: CreatorChecklist) => c.portfolio, optional: true, intro: 'Your best work: images or links to videos. Optional, but profiles with a portfolio get booked more.' },
  { key: 'payouts', label: 'Payouts', check: (c: CreatorChecklist) => c.payouts, optional: false, intro: 'Where we send your money. Set up securely with Stripe.' },
  { key: 'review', label: 'Review & submit', check: () => false, optional: false, intro: 'Check everything and send your profile to our team.' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

/** Required items done (profile, photo, socials, packages, payouts), for the progress bar. */
const requiredDone = (c: CreatorChecklist) => [c.profile, c.photo, c.socials, c.packages, c.payouts].filter(Boolean).length;
const progressOf = (c: CreatorChecklist) => (requiredDone(c) / 5) * 100;

export function OnboardingPage() {
  const { data: me, isPending, isError, error, refetch } = useMyCreator();
  const [params, setParams] = useSearchParams();

  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;

  const firstOpen = STEPS.find((s) => !s.optional && s.key !== 'review' && !s.check(me.checklist))?.key ?? 'review';
  const step = (STEPS.find((s) => s.key === params.get('step'))?.key ?? firstOpen) as StepKey;
  const index = STEPS.findIndex((s) => s.key === step);
  const go = (key: StepKey) => {
    setParams({ step: key });
    window.scrollTo({ top: 0 });
  };
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)].key);
  const back = index > 0 ? () => go(STEPS[index - 1].key) : undefined;
  const live = me.vettingStatus === 'APPROVED';

  return (
    <div className="page onboarding">
      <PageHeader eyebrow={live ? 'Creator profile' : 'Get set up · about 15 minutes'} title={live ? 'Edit your profile' : 'Set up your creator profile'} />
      <VettingBanner status={me.vettingStatus} reason={me.rejectionReason} />
      {!live && (
        <div className="onboarding__progress">
          <Progress value={progressOf(me.checklist)} label="Setup progress" />
          <span className="small muted">
            Step {index + 1} of {STEPS.length} · {requiredDone(me.checklist)} of 5 required items done
          </span>
        </div>
      )}

      <div className="onboarding__layout">
        <nav className="steps-nav" aria-label="Setup steps">
          <ol>
            {STEPS.map((s, i) => {
              const done = s.check(me.checklist);
              return (
                <li key={s.key}>
                  <button type="button" className={cx('steps-nav__btn', s.key === step && 'is-current', done && 'is-done')} aria-current={s.key === step ? 'step' : undefined} onClick={() => go(s.key)}>
                    <span className="steps-nav__num" aria-hidden>
                      {done ? <LuCheck /> : i + 1}
                    </span>
                    <span>
                      {s.label}
                      {s.optional && <span className="steps-nav__opt"> · optional</span>}
                      <span className="sr-only">{done ? ' (done)' : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card className="onboarding__step" title={`${index + 1}. ${STEPS[index].label}`}>
          <p className="muted small onboarding__intro">{STEPS[index].intro}</p>
          <StepBody step={step} me={me} next={next} back={back} go={go} />
        </Card>
      </div>
    </div>
  );
}

function StepBody({ step, me, next, back, go }: { step: StepKey; me: CreatorMe; next: () => void; back?: () => void; go: (k: StepKey) => void }) {
  switch (step) {
    case 'profile':
      return <ProfileStep me={me} onSaved={next} showOptional={me.vettingStatus === 'APPROVED'} />;
    case 'socials':
      return <SocialsStep me={me} next={next} back={back} />;
    case 'packages':
      return (
        <>
          <PackageManager me={me} />
          <StepNav back={back} next={next} nextDisabled={!me.checklist.packages} nextHint={me.checklist.packages ? undefined : 'Add at least one active package to continue.'} />
        </>
      );
    case 'portfolio':
      return <PortfolioStep me={me} next={next} back={back} />;
    case 'payouts':
      return <PayoutsStep me={me} next={next} back={back} />;
    case 'review':
      return <ReviewStep me={me} back={back} go={go} />;
  }
}
