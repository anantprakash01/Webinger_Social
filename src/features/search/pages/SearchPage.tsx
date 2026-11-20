/**
 * /search (FR-20 – FR-24). All filters live in the URL so a search can be shared or bookmarked.
 * Desktop: filter sidebar. Under 900 px: a "Filters" button opens the same panel in a drawer.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuSearchX, LuSlidersHorizontal, LuX } from 'react-icons/lu';
import { PlatformIcon } from '@/components/creator';
import { Button, Drawer, ErrorState, Pagination, SearchInput, Select, cx } from '@/components/ui';
import { AGE_BUCKETS, COUNTRY_LABEL, FOLLOWER_BUCKETS, GENDERS, LANGUAGE_LABEL, NICHE_LABEL, PLATFORMS, SORTS } from '@/lib/catalog';
import { CreatorCard, CreatorCardSkeleton, CreatorGrid } from '../components/CreatorCard';
import { FilterPanel } from '../components/FilterPanel';
import { useCreatorSearch } from '../hooks';
import { activeFilterCount, PAGE_SIZE, parseSearchUrl, toApiQuery, toSearchUrl, type SearchState } from '../schemas';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseSearchUrl(params), [params]);
  const query = useMemo(() => toApiQuery(state), [state]);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCreatorSearch(query);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** Any filter change goes back to page 1. Keyword typing replaces history; other changes push. */
  // Reads the latest URL, so a delayed keyword update never undoes a filter changed meanwhile.
  const update = (patch: Partial<SearchState>, opts: { replace?: boolean } = {}) =>
    setParams((prev) => toSearchUrl({ ...parseSearchUrl(prev), ...patch, page: 'page' in patch ? patch.page : undefined }), { replace: opts.replace });
  const clearFilters = () =>
    setParams((prev) => {
      const s = parseSearchUrl(prev);
      return toSearchUrl({ q: s.q, sort: s.sort });
    });

  // Keyword box: local text, pushed to the URL 300 ms after typing stops.
  const [text, setText] = useState(state.q ?? '');
  const [syncedQ, setSyncedQ] = useState(state.q);
  if (state.q !== syncedQ) {
    // The URL changed from outside (back button, a link): show its keyword.
    setSyncedQ(state.q);
    if ((state.q ?? '') !== text.trim()) setText(state.q ?? '');
  }
  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === state.q) return undefined;
    const t = setTimeout(() => update({ q: next }, { replace: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should restart the timer
  }, [text]);

  const filters = activeFilterCount(state);
  const total = data?.totalElements ?? 0;
  const chips = activeChips(state);

  return (
    <div className="page search-page">
      <div className="search-top">
        <div>
          <h1 className="page__title">Find creators</h1>
          <p className="muted small">Vetted creators with prices up front. Payment is held until you approve the work.</p>
        </div>
        <div className="search-top__bar">
          <SearchInput label="Search creators" value={text} onChange={setText} placeholder="Name, niche or keyword" />
          <Select label="Sort by" hideLabel value={state.sort ?? 'relevance'} onChange={(v) => update({ sort: v as SearchState['sort'] })} options={[...SORTS]} />
          <Button variant="secondary" className="search-top__filters-btn" onClick={() => setDrawerOpen(true)} aria-haspopup="dialog">
            <LuSlidersHorizontal aria-hidden /> Filters{filters > 0 && ` (${filters})`}
          </Button>
        </div>
        <div className="platform-tabs" role="group" aria-label="Platform">
          <button type="button" className={cx('platform-tab', !state.platform && 'is-on')} aria-pressed={!state.platform} onClick={() => update({ platform: undefined })}>
            All platforms
          </button>
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={cx('platform-tab', state.platform === p.value && 'is-on')}
              aria-pressed={state.platform === p.value}
              onClick={() => update({ platform: state.platform === p.value ? undefined : p.value })}
            >
              <PlatformIcon platform={p.value} /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="search-layout">
        <aside className="search-layout__filters" aria-label="Filters">
          <FilterPanel state={state} onChange={(p) => update(p)} onClear={clearFilters} />
        </aside>

        <section className="search-layout__results" aria-labelledby="results-heading">
          <div className="results-head">
            <h2 id="results-heading" className="results-head__count" aria-live="polite">
              {isPending ? 'Searching…' : `${total} creator${total === 1 ? '' : 's'}`}
            </h2>
            {chips.length > 0 && (
              <ul className="chips" aria-label="Active filters">
                {chips.map((c) => (
                  <li key={c.key} className="chip">
                    <span>{c.label}</span>
                    <button type="button" onClick={() => update(c.clear)} aria-label={`Remove filter ${c.label}`}>
                      <LuX size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isError ? (
            <ErrorState message={error.message} onRetry={() => void refetch()} />
          ) : isPending ? (
            <CreatorGrid busy>
              {Array.from({ length: 8 }, (_, i) => (
                <CreatorCardSkeleton key={i} />
              ))}
            </CreatorGrid>
          ) : data.content.length === 0 ? (
            <div className="state">
              <LuSearchX size={28} aria-hidden />
              <div className="state__title">No creators match</div>
              <div className="small">Try fewer filters or a different keyword.</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setText('');
                  setParams(new URLSearchParams());
                }}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <>
              <CreatorGrid busy={isPlaceholderData}>
                {data.content.map((c) => (
                  <CreatorCard key={c.username} creator={c} />
                ))}
              </CreatorGrid>
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                totalItems={data.totalElements}
                size={PAGE_SIZE}
                onPage={(p) => {
                  update({ page: p + 1 });
                  window.scrollTo({ top: 0 });
                }}
              />
            </>
          )}
        </section>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters">
        <FilterPanel state={state} onChange={(p) => update(p)} onClear={clearFilters} />
        <Button block onClick={() => setDrawerOpen(false)} style={{ marginTop: 16 }}>
          {isPending ? 'Show creators' : `Show ${total} creator${total === 1 ? '' : 's'}`}
        </Button>
      </Drawer>
    </div>
  );
}

/** Removable chips for the active filters, so people see at a glance why results are narrow. */
function activeChips(s: SearchState): Array<{ key: string; label: string; clear: Partial<SearchState> }> {
  const out: Array<{ key: string; label: string; clear: Partial<SearchState> }> = [];
  if (s.q) out.push({ key: 'q', label: `“${s.q}”`, clear: { q: undefined } });
  if (s.niche) out.push({ key: 'niche', label: NICHE_LABEL[s.niche], clear: { niche: undefined } });
  if (s.country) out.push({ key: 'country', label: s.city ? `${s.city}, ${COUNTRY_LABEL[s.country] ?? s.country}` : (COUNTRY_LABEL[s.country] ?? s.country), clear: { country: undefined, city: undefined } });
  if (s.followers) out.push({ key: 'followers', label: `${FOLLOWER_BUCKETS.find((b) => b.value === s.followers)?.label} followers`, clear: { followers: undefined } });
  if (s.priceMin !== undefined || s.priceMax !== undefined) {
    const label = s.priceMin !== undefined && s.priceMax !== undefined ? `$${s.priceMin} – $${s.priceMax}` : s.priceMin !== undefined ? `From $${s.priceMin}` : `Up to $${s.priceMax}`;
    out.push({ key: 'price', label, clear: { priceMin: undefined, priceMax: undefined } });
  }
  if (s.language) out.push({ key: 'language', label: LANGUAGE_LABEL[s.language] ?? s.language, clear: { language: undefined } });
  if (s.gender) out.push({ key: 'gender', label: GENDERS.find((g) => g.value === s.gender)?.label ?? s.gender, clear: { gender: undefined } });
  if (s.age) out.push({ key: 'age', label: `Age ${AGE_BUCKETS.find((b) => b.value === s.age)?.label}`, clear: { age: undefined } });
  return out;
}
