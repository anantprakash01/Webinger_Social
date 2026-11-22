/** Wizard step 2 — linked social accounts (FR-11). One per platform. */
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { PlatformIcon, VerifiedBadge } from '@/components/creator';
import { Badge, Button, FormError, Input } from '@/components/ui';
import { formatCompact, PLATFORM_LABEL, PLATFORMS } from '@/lib/catalog';
import { applyServerErrors } from '@/lib/forms';
import type { CreatorMe, SocialAccountInput } from '@/types';
import { socialFormSchema, type SocialForm } from '../../schemas';
import { useAddSocial, useRemoveSocial } from '../../workspaceHooks';
import { StepNav } from './StepNav';

export function SocialsStep({ me, next, back }: { me: CreatorMe; next?: () => void; back?: () => void }) {
  const remove = useRemoveSocial();
  const free = PLATFORMS.filter((p) => !me.socials.some((s) => s.platform === p.value));

  return (
    <div className="form-stack">
      {me.socials.length > 0 && (
        <ul className="list socials-list">
          {me.socials.map((s) => (
            <li key={s.id} className="list__item">
              <span className="social-icon">
                <PlatformIcon platform={s.platform} size={18} />
              </span>
              <div className="list__main">
                <div className="list__title">
                  {PLATFORM_LABEL[s.platform]} {s.verified ? <VerifiedBadge withText /> : <Badge tone="info">Checked during review</Badge>}
                </div>
                <div className="list__meta">
                  @{s.handle}
                  {s.platform !== 'UGC' && ` · ${formatCompact(s.followers)} followers`}
                </div>
              </div>
              <Button variant="ghost" size="sm" icon onClick={() => remove.mutate(s.id)} aria-label={`Remove ${PLATFORM_LABEL[s.platform]} account`} disabled={remove.isPending}>
                <LuTrash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {free.length > 0 ? (
        <AddSocialForm key={me.socials.length} platforms={free.map((p) => p.value)} />
      ) : (
        <p className="small muted">You've linked every platform we support.</p>
      )}

      <StepNav back={back} next={next} nextDisabled={!me.checklist.socials} nextHint={me.checklist.socials ? undefined : 'Link at least one account to continue.'} />
    </div>
  );
}

function AddSocialForm({ platforms }: { platforms: SocialAccountInput['platform'][] }) {
  const add = useAddSocial();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, control, formState } = useForm<SocialForm, unknown, SocialAccountInput>({
    resolver: zodResolver(socialFormSchema),
    defaultValues: { platform: platforms[0], handle: '', followers: '' },
  });
  const platform = useWatch({ control, name: 'platform' });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await add.mutateAsync(v);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['platform', 'handle', 'followers']));
    }
  });

  return (
    <form className="add-social" onSubmit={onSubmit} noValidate aria-label="Link a social account">
      <FormError>{formError}</FormError>
      <div className="form-row form-row--social">
        <div className="field">
          <label className="field__label" htmlFor="soc-platform">
            Platform
          </label>
          <select id="soc-platform" className="field__input" {...register('platform')}>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <Input label="Handle" placeholder="yourhandle" autoCapitalize="off" spellCheck={false} error={formState.errors.handle?.message} {...register('handle')} />
        <Input
          label={platform === 'UGC' ? 'Followers (if any)' : 'Followers'}
          inputMode="numeric"
          placeholder="12500"
          error={formState.errors.followers?.message}
          {...register('followers')}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" loading={add.isPending}>
        <LuPlus aria-hidden /> Link account
      </Button>
      <p className="small muted">We check handles and follower counts by hand during review. Live audience data comes in a later version.</p>
    </form>
  );
}
