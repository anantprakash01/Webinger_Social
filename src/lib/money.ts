/**
 * The only place that turns integer minor units into display text (convention 4).
 * Money is integer minor units everywhere else: API, mock, state, props. The market is India
 * (INR, paise), so amounts read "₹1,25,000.00" with Indian digit grouping. Variable names still say
 * "cents" for minor units; with INR they are paise.
 */

export const CURRENCY = 'INR';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** 1100000 → "₹11,000.00". Pass `{ whole: true }` for prices on cards, e.g. "₹11,000" (only when the paise are 0). */
export function formatMoney(cents: number, currency = CURRENCY, opts: { whole?: boolean } = {}): string {
  assertCents(cents);
  const whole = !!opts.whole && cents % 100 === 0;
  // Division happens only here, at display time, and only for formatting.
  return formatter(currency, whole).format(cents / 100);
}

/** Throws if a value is not a safe integer number of minor units. Use at mock and form boundaries. */
export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Money must be integer minor units, got ${cents}`);
}

/** Parses a typed amount ("10000", "10,000.50", "₹1,25,000") into integer minor units, or null if invalid. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[,\s₹$]/g, '').replace(/^Rs\.?/i, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
