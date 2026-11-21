/** Wizard step 1 — profile details (FR-10). */
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LuLock } from 'react-icons/lu';
import { Button, ChipGroup, FormError, Input, TextArea } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { citiesOf, GENDERS, LANGUAGES, LOCATIONS, NICHES } from '@/lib/catalog';
import { applyServerErrors } from '@/lib/forms';
import type { CreatorMe, CreatorProfileInput, Niche } from '@/types';
import { MAX_NICHES, profileFormSchema, type ProfileForm } from '../../schemas';
import { useSaveCreatorProfile } from '../../workspaceHooks';

const FIELDS = ['username', 'displayName', 'bio', 'city', 'country', 'gender', 'birthYear', 'languages', 'niches', 'photoUrl', 'coverUrls'] as const;

/**
 * `showOptional`: the search-only fields (gender, birth year). During setup they are asked on the last
 * step instead, so step 1 stays short (UX pass, item 11).
 */
export function ProfileStep({ me, onSaved, showOptional = false }: { me: CreatorMe; onSaved: () => void; showOptional?: boolean }) {
  const save = useSaveCreatorProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, formState } = useForm<ProfileForm, unknown, CreatorProfileInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: me.username ?? suggestUsername(me.displayName),
      displayName: me.displayName,
      bio: me.bio ?? '',
      city: me.city ?? '',
      country: me.country ?? '',
      gender: me.gender ?? '',
      birthYear: me.birthYear ? String(me.birthYear) : '',
      languages: me.languages.length ? me.languages : ['en'],
      niches: me.niches,
      photoUrl: me.photoUrl,
      coverUrls: me.coverUrls,
    },
  });
  const { errors } = formState;
  const bio = useWatch({ control, name: 'bio' }) ?? '';
  const country = useWatch({ control, name: 'country' });
  const username = useWatch({ control, name: 'username' }) ?? '';

  const submit = (stay: boolean) =>
    handleSubmit(async (v) => {
      setFormError(null);
      try {
        await save.mutateAsync(v);
        if (!stay) onSaved();
      } catch (e) {
        setFormError(applyServerErrors(e, setError, FIELDS));
      }
    });

  return (
    <form className="form-stack" onSubmit={submit(false)} noValidate>
      <FormError>{formError}</FormError>

      <div className="form-row form-row--media">
        <Controller
          control={control}
          name="photoUrl"
          render={({ field }) => (
            <ImagePicker label="Profile photo" purpose="AVATAR" shape="circle" value={field.value ?? null} onChange={field.onChange} hint="Required to submit. A clear, friendly photo works best." />
          )}
        />
        <Controller
          control={control}
          name="coverUrls"
          render={({ field }) => (
            <ImagePicker
              label="Cover image"
              purpose="COVER"
              shape="wide"
              value={field.value?.[0] ?? null}
              onChange={(url) => field.onChange(url ? [url] : [])}
              hint="Optional. Shown across the top of your profile."
            />
          )}
        />
      </div>

      <div className="form-row">
        <Input label="Display name" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
        <div className="field">
          <Input
            label="Username"
            autoCapitalize="off"
            spellCheck={false}
            readOnly={me.usernameLocked}
            error={errors.username?.message}
            hint={me.usernameLocked ? undefined : `Your public link: /u/${username.trim().toLowerCase() || 'username'}`}
            {...register('username')}
          />
          {me.usernameLocked && (
            <span className="small muted">
              <LuLock aria-hidden style={{ verticalAlign: 'middle' }} /> Locked after approval so brands' links keep working.
            </span>
          )}
        </div>
      </div>

      <TextArea
        label="Bio"
        rows={5}
        placeholder="What you make, who your audience is, and what brands you love working with."
        error={errors.bio?.message}
        counter={{ value: bio.length, max: 1000 }}
        hint="At least 30 characters."
        {...register('bio')}
      />

      <div className="form-row">
        <div className="field">
          <label className="field__label" htmlFor="pf-country">
            Country
          </label>
          <select id="pf-country" className="field__input" aria-invalid={errors.country ? true : undefined} {...register('country')}>
            <option value="">Choose…</option>
            {LOCATIONS.map((l) => (
              <option key={l.country} value={l.country}>
                {l.label}
              </option>
            ))}
          </select>
          {errors.country && <span className="field__error">{errors.country.message}</span>}
        </div>
        <Input label="City" list="pf-cities" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
        <datalist id="pf-cities">
          {citiesOf(country).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <Controller
        control={control}
        name="niches"
        render={({ field }) => (
          <ChipGroup<Niche> legend="Niches" options={NICHES} value={field.value} onChange={field.onChange} max={MAX_NICHES} error={errors.niches?.message} hint="Brands filter by these. Pick up to three." />
        )}
      />
      <Controller
        control={control}
        name="languages"
        render={({ field }) => (
          <ChipGroup legend="Languages you create in" options={LANGUAGES} value={field.value} onChange={field.onChange} max={5} error={errors.languages?.message} />
        )}
      />

      {showOptional && (
      <fieldset className="form-optional">
        <legend className="field__label">Optional</legend>
        <p className="small muted">Only used so brands can filter search results. Never shown on your profile.</p>
        <div className="form-row">
          <div className="field">
            <label className="field__label" htmlFor="pf-gender">
              Gender
            </label>
            <select id="pf-gender" className="field__input" {...register('gender')}>
              <option value="">Prefer not to say</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <Input label="Birth year" inputMode="numeric" placeholder="e.g. 1996" maxLength={4} error={errors.birthYear?.message} {...register('birthYear')} />
        </div>
      </fieldset>
      )}

      <div className="stepnav">
        <Button variant="ghost" type="button" onClick={() => void submit(true)()} disabled={save.isPending}>
          Save
        </Button>
        <div className="stepnav__next">
          <Button type="submit" loading={save.isPending}>
            Save and continue
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Ivy Sandoval" → "ivysandoval": a starting point the creator can change. */
function suggestUsername(name: string) {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w]/g, '')
    .toLowerCase()
    .replace(/^[^a-z]+/, '');
  return base.length >= 3 ? base.slice(0, 30) : '';
}
