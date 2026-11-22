/**
 * Phase E: a small i18n layer. English source text is the key, so English needs no dictionary and an
 * untranslated string simply shows in English. `{name}` placeholders are filled from `vars`.
 *
 *   const { t } = useT();  t('Hi, {name}', { name })
 *
 * Translated first: the app shell, landing, auth and checkout (launch-readiness backlog, phase E).
 * The choice is a per-browser preference (localStorage); <html lang> follows it for screen readers.
 * Hindi copy was written for the prototype — have a native speaker review it before launch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HI } from './i18n.hi';

export type Lang = 'en' | 'hi';
export const LANGS: Array<{ value: Lang; label: string; lang: string }> = [
  { value: 'en', label: 'English', lang: 'en' },
  { value: 'hi', label: 'हिन्दी', lang: 'hi' },
];

const STORAGE_KEY = 'wc.lang';
const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi: HI };

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* the choice just won't be remembered */
    }
  }, []);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);

/** Compact language picker (header, account menu, settings). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <label className={className ?? 'lang-switch'}>
      <span className="sr-only">{t('Language')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Language')}>
        {LANGS.map((l) => (
          <option key={l.value} value={l.value} lang={l.lang}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
