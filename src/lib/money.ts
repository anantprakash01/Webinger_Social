/**
 * The only place that turns integer cents into display text (convention 4).
 * Money is integer minor units everywhere else: API, mock, state, props.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** 22000 → "$220.00". Pass `{ whole: true }` for prices on cards, e.g. "$220" (only when the cents are 0). */
export function formatMoney(cents: number, currency = 'USD', opts: { whole?: boolean } = {}): string {
  assertCents(cents);
  const whole = !!opts.whole && cents % 100 === 0;
  // Division happens only here, at display time, and only for formatting.
  return formatter(currency, whole).format(cents / 100);
}

/** Throws if a value is not a safe integer number of cents. Use at mock and form boundaries. */
export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Money must be integer cents, got ${cents}`);
}

/** Parses a user-typed dollar amount ("200", "200.5", "1,200.00") into integer cents, or null if invalid. */
export function parseDollarsToCents(input: string): number | null {
  const s = input.replace(/[,\s$]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
