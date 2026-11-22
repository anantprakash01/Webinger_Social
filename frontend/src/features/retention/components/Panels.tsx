/** Phase D panels: vacation mode (creator), notification preferences (everyone), rating a brand (creator). */
import { useState } from 'react';
import { LuStar, LuTreePalm } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { Badge, Button, Card, FormError, Input, TextArea, cx } from '@/components/ui';
import { Stars } from '@/components/creator';
import { useDemoOutbox } from '@/features/auth/hooks';
import { formatWhen } from '@/lib/dates';
import { ApiError, type CreatorAvailability, type NotificationCategory, type NotificationPreferences, type OrderDetail } from '@/types';
import { useNotificationPrefs, useReviewBrand, useSaveAvailability, useSaveNotificationPrefs } from '../hooks';
import { INDIAN_MOBILE, normalisePhone } from '../schemas';

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : fallback);
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- Vacation mode ---------- */

export function AvailabilityCard({ value }: { value: CreatorAvailability }) {
  const save = useSaveAvailability();
  const [until, setUntil] = useState(value.until ?? '');
  const [message, setMessage] = useState(value.message ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = async (away: boolean) => {
    setError(null);
    try {
      await save.mutateAsync(away ? { away, until: until || null, message: message.trim() || null } : { away: false, until: null, message: null });
    } catch (e) {
      setError(errorText(e, 'Could not save. Try again.'));
    }
  };
  return (
    <Card title="Availability" action={value.away ? <Badge tone="warn">Away</Badge> : <Badge tone="ok">Taking orders</Badge>}>
      <div className="form-stack">
        {value.away ? (
          <>
            <p className="small">
              <LuTreePalm aria-hidden style={{ verticalAlign: 'middle' }} /> You're away{value.until ? ` until ${fmtDate(value.until)}` : ''}. Brands can see your profile and save you, but can't order or invite you. Orders already in
              progress continue as usual.
            </p>
            <div>
              <Button size="sm" onClick={() => void submit(false)} loading={save.isPending}>
                I'm back — take orders
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted">Going on holiday or fully booked? Pause new orders without hiding your profile.</p>
            <div className="form-row">
              <Input label="Away until (optional)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} hint="Switches off by itself after this day." />
            </div>
            <TextArea label="Note for brands (optional)" rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Back after Diwali — taking bookings from 5 Nov." />
            <div>
              <Button size="sm" variant="secondary" onClick={() => void submit(true)} loading={save.isPending}>
                <LuTreePalm aria-hidden /> Turn on away mode
              </Button>
            </div>
          </>
        )}
        <FormError>{error}</FormError>
      </div>
    </Card>
  );
}

/* ---------- Notification preferences (FR-53) ---------- */

const CATEGORY_TEXT: Record<NotificationCategory, [string, string]> = {
  ORDERS: ['Orders', 'New orders, acceptance, deliveries, approvals, disputes'],
  CAMPAIGNS: ['Campaigns', 'Applications, invitations and hiring decisions'],
  PAYOUTS: ['Payouts', 'Money sent to your bank or UPI'],
  ACCOUNT: ['Account', 'Profile review results'],
  PRODUCT_NEWS: ['Product news', 'Occasional updates and tips'],
};

export function NotificationPrefsCard({ role }: { role: 'BRAND' | 'CREATOR' | 'ADMIN' }) {
  const prefs = useNotificationPrefs();
  if (prefs.isPending) return <Card title="Notifications">Loading…</Card>;
  if (prefs.isError) return <Card title="Notifications">{prefs.error.message}</Card>;
  return <PrefsForm initial={prefs.data} role={role} />;
}

function PrefsForm({ initial, role }: { initial: NotificationPreferences; role: 'BRAND' | 'CREATOR' | 'ADMIN' }) {
  const save = useSaveNotificationPrefs();
  const [phone, setPhone] = useState(initial.phone?.replace(/^\+91/, '') ?? '');
  const [cats, setCats] = useState(initial.categories);
  const [error, setError] = useState<{ phone?: string; form?: string }>({});
  // Creators get payouts and account reviews; brands don't.
  const shown = cats.filter((c) => role === 'CREATOR' || (c.category !== 'PAYOUTS' && c.category !== 'ACCOUNT'));
  const set = (cat: NotificationCategory, key: 'email' | 'sms' | 'whatsapp', v: boolean) => setCats((xs) => xs.map((x) => (x.category === cat ? { ...x, [key]: v } : x)));
  const submit = async () => {
    const normalised = phone.trim() ? normalisePhone(phone.trim()) : null;
    if (normalised && !INDIAN_MOBILE.test(normalised)) return setError({ phone: 'Enter a 10-digit Indian mobile number.' });
    if (!normalised && cats.some((c) => c.sms || c.whatsapp)) return setError({ phone: 'Add a mobile number for SMS or WhatsApp.' });
    setError({});
    try {
      await save.mutateAsync({ phone: normalised, categories: cats });
    } catch (e) {
      setError({ form: errorText(e, 'Could not save. Try again.') });
    }
  };
  return (
    <Card title="Notifications">
      <div className="form-stack">
        <p className="small muted">In-app notifications are always on. Security emails (verification, password reset) are always sent.</p>
        <Input label="Mobile number for SMS and WhatsApp" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} error={error.phone} hint="Indian numbers only (+91)." />
        <table className="prefs-table">
          <caption className="sr-only">Where to send each kind of notification</caption>
          <thead>
            <tr>
              <th scope="col">Notify me about</th>
              <th scope="col">Email</th>
              <th scope="col">SMS</th>
              <th scope="col">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const [label, hint] = CATEGORY_TEXT[c.category];
              return (
                <tr key={c.category}>
                  <td>
                    {label}
                    <span className="small muted">{hint}</span>
                  </td>
                  {(['email', 'sms', 'whatsapp'] as const).map((k) => (
                    <td key={k}>
                      <input type="checkbox" checked={c[k]} onChange={(e) => set(c.category, k, e.target.checked)} aria-label={`${label} by ${k === 'sms' ? 'SMS' : k === 'whatsapp' ? 'WhatsApp' : 'email'}`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <FormError>{error.form ?? null}</FormError>
        <div>
          <Button size="sm" onClick={() => void submit()} loading={save.isPending}>
            Save notification settings
          </Button>
        </div>
        {isMock && initial.phone && <PhoneOutbox phone={initial.phone} />}
      </div>
    </Card>
  );
}

/** Mock only: the SMS and WhatsApp messages "sent" to the number. */
function PhoneOutbox({ phone }: { phone: string }) {
  const outbox = useDemoOutbox(phone);
  const items = (outbox.data ?? []).slice(0, 3);
  return (
    <div className="demo-inbox">
      <div className="small">
        <strong>Demo phone</strong> <span className="muted">— SMS and WhatsApp are simulated in the prototype</span>
      </div>
      {items.length === 0 ? (
        <p className="small muted">Nothing sent to {phone} yet.</p>
      ) : (
        <ul className="list">
          {items.map((m) => (
            <li key={m.id} className="list__item">
              <div className="list__main">
                <div className="list__title">
                  {m.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}: {m.subject}
                </div>
                <div className="list__meta">{formatWhen(m.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Creators rate brands ---------- */

export function BrandReviewCard({ o, role }: { o: OrderDetail; role: string }) {
  if (o.brandReview) {
    return (
      <Card title={role === 'CREATOR' ? `Your rating of ${o.counterparty.name}` : role === 'BRAND' ? "The creator's rating of working with you" : "Creator's rating of the brand"}>
        <div className="form-stack">
          <Stars value={o.brandReview.rating} />
          {o.brandReview.comment && <p className="small">“{o.brandReview.comment}”</p>}
        </div>
      </Card>
    );
  }
  if (role !== 'CREATOR' || o.status !== 'COMPLETED') return null;
  return <BrandReviewForm o={o} />;
}

function BrandReviewForm({ o }: { o: OrderDetail }) {
  const review = useReviewBrand(o.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!rating) return setError('Choose 1 to 5 stars.');
    setError(null);
    try {
      await review.mutateAsync({ rating, comment: comment.trim() || null });
    } catch (e) {
      setError(errorText(e, 'Could not post. Try again.'));
    }
  };
  return (
    <Card title={`Rate working with ${o.counterparty.name}`}>
      <div className="form-stack">
        <p className="small muted">Clear brief, quick feedback, fair revisions? Your rating helps other creators decide which brands to work with.</p>
        <fieldset className="star-input">
          <legend className="field__label">Your rating</legend>
          <div className="star-input__row">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={cx('star-input__star', n <= rating && 'is-on')}>
                <input type="radio" name="brand-rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
                <LuStar aria-hidden />
                <span className="sr-only">
                  {n} star{n === 1 ? '' : 's'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea label="Comment (optional)" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        <FormError>{error}</FormError>
        <div>
          <Button size="sm" onClick={() => void submit()} loading={review.isPending}>
            Post rating
          </Button>
        </div>
      </div>
    </Card>
  );
}
