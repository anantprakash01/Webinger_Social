import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, LanguageSwitcher, translate, useT } from './i18n';
import { HI } from './i18n.hi';

function Probe() {
  const { t } = useT();
  return <p>{t('Pay {amount}', { amount: '₹11,180.00' })}</p>;
}

describe('i18n (phase E)', () => {
  it('falls back to English and fills placeholders', () => {
    expect(translate('en', 'Pay {amount}', { amount: '₹500' })).toBe('Pay ₹500');
    expect(translate('hi', 'Not translated yet')).toBe('Not translated yet');
    expect(translate('hi', 'Pay {amount}', { amount: '₹500' })).toBe('₹500 का भुगतान करें');
  });

  it('keeps every placeholder in the Hindi copy', () => {
    for (const [en, hi] of Object.entries(HI)) {
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(vars(hi), en).toBe(vars(en));
    }
  });

  it('switches language, remembers it and sets <html lang>', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('wc.lang');
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Pay ₹11,180.00')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'hi');
    expect(screen.getByText('₹11,180.00 का भुगतान करें')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('hi');
    expect(localStorage.getItem('wc.lang')).toBe('hi');
    localStorage.removeItem('wc.lang');
  });
});
