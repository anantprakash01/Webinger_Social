/** Wizard step 6 — checklist, preview and submit for review (FR-16). */
import { Link } from 'react-router-dom';
import { LuCheck, LuCircle, LuExternalLink, LuSend } from 'react-icons/lu';
import { Button, FormError, cx } from '@/components/ui';
import { ApiError, type CreatorMe } from '@/types';
import { useSubmitForReview } from '../../workspaceHooks';
import type { StepKey } from '../../pages/OnboardingPage';
import { StepNav } from './StepNav';

const ITEMS: Array<{ key: keyof CreatorMe['checklist']; label: string; step: StepKey; optional?: boolean }> = [
  { key: 'profile', label: 'Profile details', step: 'profile' },
  { key: 'photo', label: 'Profile photo', step: 'profile' },
  { key: 'socials', label: 'At least one social account', step: 'socials' },
  { key: 'packages', label: 'At least one active package', step: 'packages' },
  { key: 'portfolio', label: 'Portfolio', step: 'portfolio', optional: true },
  { key: 'payouts', label: 'Payouts set up', step: 'payouts' },
];

export function ReviewStep({ me, back, go }: { me: CreatorMe; back?: () => void; go: (k: StepKey) => void }) {
  const submit = useSubmitForReview();
  const ready = ITEMS.every((i) => i.optional || me.checklist[i.key]);
  const canSubmit = me.vettingStatus === 'DRAFT' || me.vettingStatus === 'REJECTED';
  const serverMissing = submit.error instanceof ApiError ? submit.error.fieldErrors : [];

  return (
    <div className="form-stack">
      <ul className="checklist-review">
        {ITEMS.map((i) => {
          const done = me.checklist[i.key];
          return (
            <li key={i.key} className={cx(done && 'is-done')}>
              <span className="checklist-review__icon" aria-hidden>
                {done ? <LuCheck /> : <LuCircle />}
              </span>
              <span className="checklist-review__label">
                {i.label}
                {i.optional && <span className="muted"> (recommended)</span>}
                <span className="sr-only">{done ? ': done' : ': not done'}</span>
              </span>
              {!done && (
                <button type="button" className="link small" onClick={() => go(i.step)}>
                  Fix
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {me.username && (
        <Link to={`/u/${me.username}`} className="link small" target="_blank" rel="noopener">
          Preview your public profile <LuExternalLink aria-hidden style={{ verticalAlign: 'middle' }} />
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
      )}

      {serverMissing.length > 0 ? (
        <FormError>
          {submit.error?.message}
          <ul className="small">
            {serverMissing.map((f) => (
              <li key={f.field}>{f.message}</li>
            ))}
          </ul>
        </FormError>
      ) : (
        <FormError>{submit.error?.message}</FormError>
      )}

      {me.vettingStatus === 'PENDING_REVIEW' && (
        <p className="small" role="status">
          Sent for review{me.submittedAt && ` on ${new Date(me.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}. We'll email you when it's done.
        </p>
      )}
      {me.vettingStatus === 'APPROVED' && (
        <p className="small" role="status">
          Your profile is live. Changes you save appear on it right away.
        </p>
      )}

      <StepNav back={back} />
      {canSubmit && (
        <div className="submit-review">
          <p className="small muted">Our team checks your accounts and profile, usually within two working days. You can keep editing while you wait.</p>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!ready}>
            <LuSend aria-hidden /> {me.vettingStatus === 'REJECTED' ? 'Resubmit for review' : 'Submit for review'}
          </Button>
        </div>
      )}
    </div>
  );
}
