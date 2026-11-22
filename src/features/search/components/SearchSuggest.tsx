/**
 * Phase E: the search box with suggestions (creators, niches, cities) and recent searches.
 * An ARIA 1.2 combobox: arrow keys move through the options, Enter picks, Escape closes.
 * Recent searches are a per-browser convenience in localStorage (never needed for anything to work).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LuClock, LuMapPin, LuSearch, LuTag, LuUserRound, LuX } from 'react-icons/lu';
import { api } from '@/api/client';
import { cx } from '@/components/ui';
import type { SearchSuggestion } from '@/types';

const RECENT_KEY = 'wc.recentSearches';
const MAX_RECENT = 5;

export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT)));
  } catch {
    /* storage unavailable: recents are optional */
  }
}

function clearRecent() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Debounced value. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Option = { key: string; label: string; detail?: string | null; icon: 'recent' | SearchSuggestion['kind']; pick: () => void };

const ICON = { recent: LuClock, CREATOR: LuUserRound, NICHE: LuTag, CITY: LuMapPin } as const;

export function SearchSuggest({
  value,
  onChange,
  onPick,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: SearchSuggestion) => void;
  onSearch: (q: string) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const wrap = useRef<HTMLDivElement>(null);
  const typed = useDebounced(value.trim(), 150);
  const suggest = useQuery({ queryKey: ['creators', 'suggest', typed.toLowerCase()], queryFn: () => api.creators.suggest(typed), enabled: typed.length >= 1, staleTime: 60_000 });

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const submit = (q: string) => {
    rememberSearch(q);
    setRecent(readRecent());
    onSearch(q.trim());
    close();
  };

  const options: Option[] = value.trim()
    ? (suggest.data?.suggestions ?? []).map((s) => ({
        key: `${s.kind}:${s.value}`,
        label: s.label,
        detail: s.detail,
        icon: s.kind,
        pick: () => {
          if (s.kind === 'CREATOR') rememberSearch(s.label);
          onPick(s);
          close();
        },
      }))
    : recent.map((r) => ({
        key: `recent:${r}`,
        label: r,
        detail: null,
        icon: 'recent' as const,
        pick: () => {
          onChange(r);
          submit(r);
        },
      }));
  const showList = open && options.length > 0;

  // Close when focus or a click leaves the box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showList && active >= 0) options[active].pick();
      else submit(value);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="search suggest" ref={wrap}>
      <label htmlFor={id} className="sr-only">
        Search creators
      </label>
      <LuSearch aria-hidden className="search__icon" />
      <input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder="Name, niche, city or keyword"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setRecent(readRecent());
          setOpen(true);
        }}
        onBlur={() => value.trim() && rememberSearch(value)}
        onKeyDown={onKey}
      />
      {showList && (
        <div className="suggest__panel">
          {!value.trim() && (
            <div className="suggest__head">
              <span>Recent searches</span>
              <button
                type="button"
                className="link small"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  clearRecent();
                  setRecent([]);
                }}
              >
                <LuX aria-hidden /> Clear
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={value.trim() ? 'Suggestions' : 'Recent searches'} className="suggest__list">
            {options.map((o, i) => {
              const Icon = ICON[o.icon];
              return (
                <li
                  key={o.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cx('suggest__item', i === active && 'is-active')}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={o.pick}
                >
                  <Icon aria-hidden />
                  <span className="suggest__label">{o.label}</span>
                  {o.detail && <span className="suggest__detail">{o.detail}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
