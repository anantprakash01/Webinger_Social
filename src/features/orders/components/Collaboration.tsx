/**
 * Phase C — collaboration cards on the order page: drafts before posting, product shipping, requests for
 * more time and post results. Each card shows only what the viewer can do now; the mock re-checks.
 */
import { useState } from 'react';
import { LuCalendarClock, LuCheck, LuChartBar, LuFileImage, LuLink, LuPackage, LuPencil, LuSend, LuTruck } from 'react-icons/lu';
import { Badge, Button, Card, Drawer, FormError, Input, TextArea, cx } from '@/components/ui';
import { formatWhen } from '@/lib/dates';
import { ApiError, type Delivery, type DeliveryItem, type OrderDetail, type PostMetrics, type Role } from '@/types';
import { formatDay } from '../format';
import { useCollab } from '../hooks';
import { MAX_EXTENSION_DAYS, extensionRequestSchema, postMetricsSchema, shipmentSchema } from '../schemas';
import { DeliverDialog } from './ActionPanel';

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : fallback);
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

function Items({ items }: { items: DeliveryItem[] }) {
  return (
    <ul className="delivery__items">
      {items.map((it, j) =>
        it.type === 'FILE' ? (
          <li key={j}>
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="delivery__file">
              <img src={it.url} alt="" />
              <span>
                <LuFileImage aria-hidden /> {it.name ?? `File ${j + 1}`}
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ) : (
          <li key={j}>
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="delivery__link link">
              <LuLink aria-hidden /> {it.name ?? 'Link'}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ),
      )}
    </ul>
  );
}

/* ---------- Drafts ---------- */

const DRAFT_BADGE = {
  PENDING: { tone: 'warn', label: 'Waiting for the brand' },
  APPROVED: { tone: 'ok', label: 'Approved' },
  CHANGES_REQUESTED: { tone: 'danger', label: 'Changes requested' },
} as const;

export function DraftsCard({ o, role }: { o: OrderDetail; role: Role }) {
  const [sharing, setSharing] = useState(false);
  const [changesFor, setChangesFor] = useState<string | null>(null);
  const collab = useCollab(o.id);
  const pending = o.drafts.find((d) => d.status === 'PENDING');
  const canShare = role === 'CREATOR' && o.status === 'IN_PROGRESS' && !pending;
  if (o.drafts.length === 0 && !canShare) return null;
  return (
    <Card
      title="Drafts"
      action={
        canShare ? (
          <Button size="sm" variant="secondary" onClick={() => setSharing(true)}>
            <LuSend aria-hidden /> Share a draft
          </Button>
        ) : null
      }
    >
      {o.drafts.length === 0 ? (
        <p className="small muted">Share a draft before posting so the brand can approve it or ask for changes. This doesn't use a revision.</p>
      ) : (
        <ul className="deliveries">
          {o.drafts.map((d, i) => (
            <li key={d.id} className={cx('delivery', i === 0 && 'is-latest')}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <strong className="small">Draft {o.drafts.length - i}</strong>
                <Badge tone={DRAFT_BADGE[d.status].tone}>{DRAFT_BADGE[d.status].label}</Badge>
                <span className="list__meta">{formatWhen(d.submittedAt)}</span>
              </div>
              {d.note && <p className="small delivery__note">{d.note}</p>}
              <Items items={d.items} />
              {d.feedback && (
                <p className="small delivery__note">
                  <strong>Brand:</strong> {d.feedback}
                </p>
              )}
              {role === 'BRAND' && d.status === 'PENDING' && o.status === 'IN_PROGRESS' && (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button size="sm" loading={collab.isPending} onClick={() => collab.mutate({ type: 'review-draft', draftId: d.id, decision: 'APPROVE' })}>
                    <LuCheck aria-hidden /> Approve draft
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setChangesFor(d.id)}>
                    <LuPencil aria-hidden /> Ask for changes
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {sharing && <DeliverDialog o={o} mode="draft" onClose={() => setSharing(false)} />}
      {changesFor && <DraftChanges orderId={o.id} draftId={changesFor} onClose={() => setChangesFor(null)} />}
    </Card>
  );
}

function DraftChanges({ orderId, draftId, onClose }: { orderId: string; draftId: string; onClose: () => void }) {
  const collab = useCollab(orderId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (note.trim().length < 10) return setError('Explain the changes in at least 10 characters.');
    try {
      await collab.mutateAsync({ type: 'review-draft', draftId, decision: 'CHANGES', note: note.trim() });
      onClose();
    } catch (e) {
      setError(errorText(e, 'Could not send. Try again.'));
    }
  };
  return (
    <Drawer open onClose={onClose} title="Ask for changes to the draft">
      <div className="form-stack">
        <p className="small muted">Drafts don't count towards the revisions included with the order.</p>
        <TextArea label="What should change?" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} error={error ?? undefined} />
        <div className="row">
          <Button onClick={() => void submit()} loading={collab.isPending}>
            Send
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------- Product shipping ---------- */

export function ShippingCard({ o, role }: { o: OrderDetail; role: Role }) {
  const collab = useCollab(o.id);
  const [editing, setEditing] = useState(false);
  if (!o.brief.needsShipping) return null;
  const s = o.shipment;
  const open = o.status === 'PENDING_ACCEPTANCE' || o.status === 'IN_PROGRESS';
  return (
    <Card title="Product shipping">
      <div className="form-stack">
        {s ? (
          <div className="shipment">
            <LuTruck aria-hidden />
            <div>
              <div className="list__title">
                {s.courier} · <span className="mono">{s.trackingNumber}</span>
              </div>
              <div className="list__meta">
                Shipped {formatWhen(s.shippedAt)} · {s.receivedAt ? `received ${formatWhen(s.receivedAt)}` : 'not received yet'}
              </div>
            </div>
            {s.receivedAt ? <Badge tone="ok">Received</Badge> : <Badge tone="warn">In transit</Badge>}
          </div>
        ) : (
          <p className="small muted">
            {role === 'BRAND'
              ? 'Ship the product to the creator and add the tracking number here. Ask for their delivery address in Messages.'
              : 'The brand will ship the product and add tracking here. Share your delivery address in Messages.'}
          </p>
        )}
        {role === 'BRAND' && open && !s?.receivedAt && (
          <div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <LuPackage aria-hidden /> {s ? 'Update tracking' : 'Add tracking'}
            </Button>
          </div>
        )}
        {role === 'CREATOR' && open && s && !s.receivedAt && (
          <div>
            <Button size="sm" loading={collab.isPending} onClick={() => collab.mutate({ type: 'received' })}>
              <LuCheck aria-hidden /> I received the product
            </Button>
          </div>
        )}
      </div>
      {editing && <ShipmentForm o={o} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function ShipmentForm({ o, onClose }: { o: OrderDetail; onClose: () => void }) {
  const collab = useCollab(o.id);
  const [courier, setCourier] = useState(o.shipment?.courier ?? '');
  const [tracking, setTracking] = useState(o.shipment?.trackingNumber ?? '');
  const [errors, setErrors] = useState<{ courier?: string; trackingNumber?: string; form?: string }>({});
  const submit = async () => {
    const v = shipmentSchema.safeParse({ courier, trackingNumber: tracking });
    if (!v.success) {
      const e: typeof errors = {};
      for (const i of v.error.issues) e[i.path[0] as 'courier' | 'trackingNumber'] ??= i.message;
      return setErrors(e);
    }
    try {
      await collab.mutateAsync({ type: 'ship', ...v.data });
      onClose();
    } catch (e) {
      setErrors({ form: errorText(e, 'Could not save. Try again.') });
    }
  };
  return (
    <Drawer open onClose={onClose} title="Shipping details">
      <div className="form-stack">
        <Input label="Courier" placeholder="e.g. Delhivery, Blue Dart, India Post" value={courier} onChange={(e) => setCourier(e.target.value)} error={errors.courier} />
        <Input label="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} error={errors.trackingNumber} />
        <FormError>{errors.form ?? null}</FormError>
        <div className="row">
          <Button onClick={() => void submit()} loading={collab.isPending}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------- More time ---------- */

export function ExtensionCard({ o, role }: { o: OrderDetail; role: Role }) {
  const collab = useCollab(o.id);
  const [asking, setAsking] = useState(false);
  const x = o.extension;
  const pending = x?.status === 'PENDING';
  const canAsk = role === 'CREATOR' && o.status === 'IN_PROGRESS' && !pending;
  if (!x && !canAsk) return null;
  // Only show the card for a creator who might need it, or when there is a request to see.
  return (
    <Card title="Timing">
      <div className="form-stack">
        {x && (
          <div className="shipment">
            <LuCalendarClock aria-hidden />
            <div>
              <div className="list__title">
                {x.extraDays} more day{x.extraDays === 1 ? '' : 's'} requested{x.status !== 'PENDING' && ` — ${x.status === 'ACCEPTED' ? 'granted' : 'declined'}`}
              </div>
              <div className="list__meta">
                “{x.reason}” · {x.status === 'ACCEPTED' ? 'new due date' : 'would be due'} {formatDay(x.newDueAt)}
              </div>
            </div>
            {pending && <Badge tone="warn">Waiting for the brand</Badge>}
          </div>
        )}
        {role === 'BRAND' && pending && o.status === 'IN_PROGRESS' && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button size="sm" loading={collab.isPending} onClick={() => collab.mutate({ type: 'review-extension', decision: 'ACCEPT' })}>
              Give more time
            </Button>
            <Button size="sm" variant="secondary" loading={collab.isPending} onClick={() => collab.mutate({ type: 'review-extension', decision: 'DECLINE' })}>
              Keep the due date
            </Button>
          </div>
        )}
        {canAsk && (
          <div>
            <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
              <LuCalendarClock aria-hidden /> Ask for more time
            </Button>
          </div>
        )}
      </div>
      {asking && <ExtensionForm o={o} onClose={() => setAsking(false)} />}
    </Card>
  );
}

function ExtensionForm({ o, onClose }: { o: OrderDetail; onClose: () => void }) {
  const collab = useCollab(o.id);
  const [days, setDays] = useState('3');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ extraDays?: string; reason?: string; form?: string }>({});
  const submit = async () => {
    const v = extensionRequestSchema.safeParse({ extraDays: /^\d+$/.test(days) ? Number(days) : NaN, reason });
    if (!v.success) {
      const e: typeof errors = {};
      for (const i of v.error.issues) e[i.path[0] as 'extraDays' | 'reason'] ??= i.message;
      return setErrors(e);
    }
    try {
      await collab.mutateAsync({ type: 'request-extension', ...v.data });
      onClose();
    } catch (e) {
      setErrors({ form: errorText(e, 'Could not send. Try again.') });
    }
  };
  return (
    <Drawer open onClose={onClose} title="Ask for more time">
      <div className="form-stack">
        <p className="small muted">
          {o.dueAt ? `Currently due ${formatDay(o.dueAt)}. ` : ''}The brand accepts or declines. Up to {MAX_EXTENSION_DAYS} days at a time.
        </p>
        <Input label="Extra days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} error={errors.extraDays} />
        <TextArea label="Why do you need more time?" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <FormError>{errors.form ?? null}</FormError>
        <div className="row">
          <Button onClick={() => void submit()} loading={collab.isPending}>
            Send request
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------- Post results ---------- */

export function MetricsLine({ m }: { m: PostMetrics }) {
  const parts = [`${compact.format(m.views)} views`, `${compact.format(m.likes)} likes`, `${compact.format(m.comments)} comments`];
  if (m.shares != null) parts.push(`${compact.format(m.shares)} shares`);
  if (m.reach != null) parts.push(`${compact.format(m.reach)} reach`);
  return (
    <span className="metrics-line small">
      <LuChartBar aria-hidden /> {parts.join(' · ')}
    </span>
  );
}

/** Creator-only button + drawer to record a post's results; brand and creator both see the numbers. */
export function PostMetricsControl({ o, d, index, role }: { o: OrderDetail; d: Delivery; index: number; role: Role }) {
  const [open, setOpen] = useState(false);
  const item = d.items[index];
  const editable = role === 'CREATOR' && (o.status === 'DELIVERED' || o.status === 'COMPLETED');
  return (
    <>
      {item.metrics && <MetricsLine m={item.metrics} />}
      {editable && (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <LuChartBar aria-hidden /> {item.metrics ? 'Update results' : 'Add results'}
        </Button>
      )}
      {open && <MetricsForm o={o} d={d} index={index} onClose={() => setOpen(false)} />}
    </>
  );
}

const METRIC_FIELDS = [
  ['views', 'Views', true],
  ['likes', 'Likes', true],
  ['comments', 'Comments', true],
  ['shares', 'Shares', false],
  ['reach', 'Reach (accounts)', false],
] as const;

function MetricsForm({ o, d, index, onClose }: { o: OrderDetail; d: Delivery; index: number; onClose: () => void }) {
  const collab = useCollab(o.id);
  const m = d.items[index].metrics;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(METRIC_FIELDS.map(([k]) => [k, m?.[k] != null ? String(m[k]) : ''])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const num = (s: string) => (s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
    const body = { itemIndex: index, views: num(values.views) ?? NaN, likes: num(values.likes) ?? NaN, comments: num(values.comments) ?? NaN, shares: num(values.shares), reach: num(values.reach) };
    const v = postMetricsSchema.safeParse(body);
    if (!v.success) {
      const e: Record<string, string> = {};
      for (const i of v.error.issues) e[String(i.path[0])] ??= Number.isNaN((body as Record<string, unknown>)[String(i.path[0])]) ? 'Enter a whole number.' : i.message;
      return setErrors(e);
    }
    try {
      await collab.mutateAsync({ type: 'metrics', deliveryId: d.id, body: v.data });
      onClose();
    } catch (e) {
      setErrors({ form: errorText(e, 'Could not save. Try again.') });
    }
  };
  return (
    <Drawer open onClose={onClose} title="Post results">
      <div className="form-stack">
        <p className="small muted">Copy the numbers from your app's insights. The brand sees them on the order and their dashboard.</p>
        <div className="metrics-grid">
          {METRIC_FIELDS.map(([k, label, required]) => (
            <Input
              key={k}
              label={required ? label : `${label} (optional)`}
              inputMode="numeric"
              value={values[k]}
              onChange={(e) => setValues((x) => ({ ...x, [k]: e.target.value }))}
              error={errors[k]}
            />
          ))}
        </div>
        <FormError>{errors.form ?? null}</FormError>
        <div className="row">
          <Button onClick={() => void submit()} loading={collab.isPending}>
            Save results
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
