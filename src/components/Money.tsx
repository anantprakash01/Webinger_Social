/** Shows an amount in Indian shorthand (₹1.2L) with the exact amount on hover and for screen readers. */
import { formatMoney, formatMoneyShort } from '@/lib/money';

export function ShortMoney({ cents, currency = 'INR' }: { cents: number; currency?: string }) {
  const full = formatMoney(cents, currency);
  const short = formatMoneyShort(cents, currency);
  if (short === full || short === formatMoney(cents, currency, { whole: true })) return <>{short}</>;
  return (
    <span title={full}>
      <span aria-hidden>{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}
