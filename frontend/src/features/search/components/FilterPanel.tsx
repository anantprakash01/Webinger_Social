import { useId } from 'react';
import { Button, Select } from '@/components/ui';
import { AGE_BUCKETS, citiesOf, FOLLOWER_BUCKETS, GENDERS, LANGUAGES, LOCATIONS, NICHES } from '@/lib/catalog';
import type { SearchState } from '../schemas';

type Patch = Partial<SearchState>;

/**
 * Search filters (FR-21) except keyword, platform and sort, which sit above the results.
 * Used in the desktop sidebar and inside the phone drawer.
 */
export function FilterPanel({ state, onChange, onClear }: { state: SearchState; onChange: (p: Patch) => void; onClear: () => void }) {
  const cities = citiesOf(state.country);
  return (
    <div className="filters">
      <Select
        label="Niche"
        value={state.niche}
        onChange={(v) => onChange({ niche: v as SearchState['niche'] })}
        options={NICHES}
        allLabel="Any niche"
      />
      <Select
        label="Country"
        value={state.country}
        onChange={(v) => onChange({ country: v, city: undefined })}
        options={LOCATIONS.map((l) => ({ value: l.country, label: l.label }))}
        allLabel="Any country"
      />
      <Select
        label="City"
        value={state.city}
        onChange={(v) => onChange({ city: v })}
        options={cities.map((c) => ({ value: c, label: c }))}
        allLabel={state.country ? 'Any city' : 'Choose a country first'}
        disabled={!state.country}
      />
      <Select
        label="Followers"
        value={state.followers}
        onChange={(v) => onChange({ followers: v as SearchState['followers'] })}
        options={FOLLOWER_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        allLabel="Any size"
      />
      <PriceRange min={state.priceMin} max={state.priceMax} onChange={(priceMin, priceMax) => onChange({ priceMin, priceMax })} />
      <Select label="Language" value={state.language} onChange={(v) => onChange({ language: v })} options={LANGUAGES} allLabel="Any language" />
      <Select
        label="Gender"
        value={state.gender}
        onChange={(v) => onChange({ gender: v as SearchState['gender'] })}
        options={GENDERS}
        allLabel="Any gender"
      />
      <Select
        label="Age"
        value={state.age}
        onChange={(v) => onChange({ age: v as SearchState['age'] })}
        options={AGE_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        allLabel="Any age"
      />
      <label className="check small">
        <input type="checkbox" checked={!!state.fast} onChange={(e) => onChange({ fast: e.target.checked || undefined })} />
        <span>Usually accepts within 24 h</span>
      </label>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}

/** Starting-price range in whole rupees. Applies on blur or Enter so typing does not search on every key. */
function PriceRange({ min, max, onChange }: { min?: number; max?: number; onChange: (min?: number, max?: number) => void }) {
  const id = useId();
  const read = (el: HTMLInputElement) => (/^\d{1,7}$/.test(el.value.trim()) ? Number(el.value.trim()) : undefined);
  const commit = (form: HTMLElement) => {
    const [a, b] = Array.from(form.querySelectorAll('input'));
    let lo = read(a);
    let hi = read(b);
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    if (lo !== min || hi !== max) onChange(lo, hi);
  };
  return (
    <fieldset
      className="price-range"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget);
        }
      }}
    >
      <legend className="select__label">Starting price (₹)</legend>
      <div className="price-range__inputs">
        <label className="sr-only" htmlFor={`${id}-min`}>
          Minimum price in rupees
        </label>
        <input key={`min-${min}`} id={`${id}-min`} inputMode="numeric" placeholder="Min" defaultValue={min ?? ''} className="price-range__input" />
        <span aria-hidden>–</span>
        <label className="sr-only" htmlFor={`${id}-max`}>
          Maximum price in rupees
        </label>
        <input key={`max-${max}`} id={`${id}-max`} inputMode="numeric" placeholder="Max" defaultValue={max ?? ''} className="price-range__input" />
      </div>
    </fieldset>
  );
}
