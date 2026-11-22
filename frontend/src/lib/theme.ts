/**
 * Day / night mode. The preference is per device (a viewer convenience, so localStorage is fine):
 * 'system' follows the operating system; 'light' or 'dark' set html[data-theme], which tokens.css reads.
 * index.html applies the saved choice before the first paint, so there is no white flash.
 */
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'wc.theme';
const EVENT = 'wc:theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (pref: ThemePref): Theme => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref);

/** Sets html[data-theme] for an explicit choice; removes it to follow the device. */
export function applyTheme(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === 'system') delete el.dataset.theme;
  else el.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  mq?.addEventListener?.('change', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
    mq?.removeEventListener?.('change', cb);
  };
}

const snapshot = () => `${getThemePref()}|${resolveTheme(getThemePref())}`;

export function useTheme() {
  const [pref, resolved] = useSyncExternalStore(subscribe, snapshot, () => 'system|light').split('|') as [ThemePref, Theme];
  return {
    pref,
    resolved,
    setPref: setThemePref,
    /** Day ↔ night, as an explicit choice. */
    toggle: () => setThemePref(resolved === 'dark' ? 'light' : 'dark'),
  };
}
