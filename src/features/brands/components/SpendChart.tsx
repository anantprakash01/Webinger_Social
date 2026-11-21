/**
 * Spend per month (UX pass, FR-71): one series, so one hue (navy) and no legend — the card title
 * names it. Bars are thin with rounded tops on a shared baseline; hovering or focusing a month shows
 * its value; the same numbers are in a screen-reader table.
 */
import { useState } from 'react';
import { formatMoney } from '@/lib/money';

interface Month {
  month: string;
  cents: number;
}

const label = (m: string, style: 'short' | 'long') => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' });

export function SpendChart({ months, currency }: { months: Month[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => m.cents));
  const total = months.reduce((s, m) => s + m.cents, 0);
  const shown = active ?? months.length - 1;

  return (
    <div className="spend">
      <div className="spend__head">
        <div>
          <div className="spend__value">{formatMoney(Math.max(0, months[shown]?.cents ?? 0), currency)}</div>
          <div className="small muted">{months[shown] ? label(months[shown].month, 'long') : ''}</div>
        </div>
        <div className="small muted" style={{ textAlign: 'right' }}>
          {formatMoney(total, currency)}
          <br />
          last 6 months
        </div>
      </div>
      <div className="spend__plot" aria-hidden onMouseLeave={() => setActive(null)}>
        {months.map((m, i) => {
          const h = Math.max(0, m.cents) / max;
          return (
            <div
              key={m.month}
              className={`spend__col${active === i ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
            >
              {active === i && (
                <div className="spend__tip">
                  <strong>{formatMoney(m.cents, currency)}</strong> {label(m.month, 'long')}
                </div>
              )}
              <div className="spend__bar" style={{ height: `${Math.max(h * 100, m.cents > 0 ? 2 : 0)}%` }} />
              <div className="spend__tick">{label(m.month, 'short')}</div>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Spend per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Spend</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{label(m.month, 'long')}</th>
              <td>{formatMoney(m.cents, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
