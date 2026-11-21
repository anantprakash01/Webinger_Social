/** Wizard step 6 — checklist, preview and submit for review (FR-16). */
import { formatWhen } from '@/lib/dates';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GENDERS } from '@/lib/catalog';
import { LuCheck, LuCircle, LuExternalLink, LuSend } from 'react-icons/lu';
import { Button, FormError, Input, cx } from '@/components/ui';
import { ApiError, type CreatorMe } from '@/types';
import { useSaveCreatorProfile, useSubmitForReview } from '../../workspaceHooks';
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
          Sent for review{me.submittedAt && ` ${formatWhen(me.submittedAt)}`}. We'll email you when it's done.
        </p>
      )}
      {me.vettingStatus === 'APPROVED' && (
        <p className="small" role="status">
          Your profile is live. Changes you save appear on it right away.
        </p>
      )}

      {me.checklist.profile && me.username && me.vettingStatus !== 'APPROVED' && <SearchDetails me={me} />}

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

/**
 * Optional search-only details (gender, birth year), asked here rather than on step 1 (UX pass,
 * item 11). Saves the whole profile with these two fields changed.
 */
function SearchDetails({ me }: { me: CreatorMe }) {
  const save = useSaveCreatorProfile();
  const [gender, setGender] = useState(me.gender ?? '');
  const [year, setYear] = useState(me.birthYear ? String(me.birthYear) : '');
  const yearError = save.error instanceof ApiError ? save.error.fieldErrors.find((f) => f.field === 'birthYear')?.message : undefined;
  const changed = gender !== (me.gender ?? '') || year !== (me.birthYear ? String(me.birthYear) : '');
  return (
    <fieldset className="form-optional">
      <legend className="field__label">Optional: help brands find you</legend>
      <p className="small muted">Only used as search filters. Never shown on your profile.</p>
      <div className="form-row">
        <div className="field">
          <label className="field__label" htmlFor="rv-gender">
            Gender
          </label>
          <select id="rv-gender" className="field__input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Prefer not to say</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <Input label="Birth year" inputMode="numeric" placeholder="e.g. 1996" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/D/g, ''))} error={yearError} />
      </div>
      {save.error && !yearError && <FormError>{save.error.message}</FormError>}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!changed}
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              username: me.username!,
              displayName: me.displayName,
              bio: me.bio ?? '',
              city: me.city ?? '',
              country: me.country ?? '',
              gender: (gender || null) as CreatorMe['gender'],
              birthYear: year ? Number(year) : null,
              languages: me.languages,
              niches: me.niches,
              photoUrl: me.photoUrl,
              coverUrls: me.coverUrls,
            })
          }
        >
          Save these details
        </Button>
      </div>
    </fieldset>
  );
}
