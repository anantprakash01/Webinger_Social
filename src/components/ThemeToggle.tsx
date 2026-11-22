/** Day / night switch (icon button) and the three-way choice for Settings. */
import { LuMonitor, LuMoon, LuSun } from 'react-icons/lu';
import { useT } from '@/lib/i18n';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cx } from '@/components/ui';

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { resolved, toggle } = useTheme();
  const night = resolved === 'dark';
  const label = t(night ? 'Switch to day mode' : 'Switch to night mode');
  return (
    <button type="button" className={cx('theme-toggle', className)} onClick={toggle} aria-label={label} title={label}>
      {night ? <LuSun aria-hidden /> : <LuMoon aria-hidden />}
    </button>
  );
}

const OPTIONS: Array<{ value: ThemePref; label: string; icon: typeof LuSun }> = [
  { value: 'system', label: 'Match my device', icon: LuMonitor },
  { value: 'light', label: 'Day', icon: LuSun },
  { value: 'dark', label: 'Night', icon: LuMoon },
];

export function ThemeChoice() {
  const { t } = useT();
  const { pref, setPref } = useTheme();
  return (
    <fieldset className="theme-choice">
      <legend className="sr-only">{t('Appearance')}</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className={cx('theme-choice__opt', pref === o.value && 'is-on')}>
          <input type="radio" name="theme" value={o.value} checked={pref === o.value} onChange={() => setPref(o.value)} />
          <o.icon aria-hidden /> {t(o.label)}
        </label>
      ))}
    </fieldset>
  );
}
