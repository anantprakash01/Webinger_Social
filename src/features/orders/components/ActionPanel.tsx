/**
 * "What happens next" for the viewer, with a live countdown and only the actions the server allows
 * (`allowedActions`, convention 5). Every action is confirmed in a dialog that says what it does to the money.
 */
import { useRef, useState, type ReactNode } from 'react';
import { StickyBar } from '@/components/StickyBar';
import { AdminCancel } from './AdminCancel';
import { LuCircleCheck, LuCircleX, LuClock, LuFlag, LuHourglass, LuPlus, LuRotateCcw, LuThumbsUp, LuTrash2, LuUpload } from 'react-icons/lu';
import { Badge, Button, Card, Drawer, FormError, Input, TextArea, cx } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { formatMoney } from '@/lib/money';
import { ApiError, type DeliveryItem, type OrderDetail, type Role } from '@/types';
import { countdown, formatDay, serverNow } from '../format';
import { useCollab, useOrderAction, useTicker, type OrderActionInput } from '../hooks';

type Dialog = 'accept' | 'decline' | 'cancel' | 'approve' | 'revision' | 'dispute' | 'deliver' | null;

export function ActionPanel({ o, role, fetchedAt }: { o: OrderDetail; role: Role; fetchedAt: number }) {
  const deviceNow = useTicker();
  const nowMs = serverNow(o.serverTime, fetchedAt, deviceNow);
  const [dialog, setDialog] = useState<Dialog>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const can = (a: OrderDetail['allowedActions'][number]) => o.allowedActions.includes(a);
  const first = o.counterparty.name.split(' ')[0];
  const m = o.money;
  const left = o.maxRevisions - o.revisionCount;

  const deadline = (at: string | null, label: string) => {
    if (!at) return null;
    const c = countdown(at, nowMs);
    return (
      <span className={cx('deadline', c.urgent && 'deadline--urgent', c.overdue && 'deadline--over')}>
        <LuClock aria-hidden /> {label} {formatDay(at)} · {c.text}
      </span>
    );
  };

  let tone: 'info' | 'warn' | 'ok' | 'neutral' | 'danger' = 'info';
  let icon: ReactNode = <LuHourglass aria-hidden />;
  let title = '';
  let text: ReactNode = null;
  let when: ReactNode = null;

  switch (o.status) {
    case 'PENDING_ACCEPTANCE':
      when = deadline(o.acceptBy, 'Accept by');
      if (role === 'CREATOR') {
        tone = 'warn';
        title = 'New order — accept or decline';
        text = `Accepting charges the brand's payment and starts your ${o.deliveryDays}-day delivery clock. You receive ${formatMoney(m.creatorPayoutCents, m.currency)} when the work is approved.`;
      } else {
        title = `Waiting for ${first} to accept`;
        text = `Your payment of ${formatMoney(m.totalCents, m.currency)} is held (${o.payment.methodLabel}), not charged. If ${first} doesn't accept in time, the hold is released.`;
      }
      break;
    case 'IN_PROGRESS':
      when = deadline(o.dueAt, 'Due');
      if (role === 'CREATOR') {
        tone = o.late ? 'danger' : 'warn';
        title = o.revisionCount ? `Revision ${o.revisionCount} requested — deliver an update` : 'In progress — deliver when ready';
        text = 'Upload files or paste links to the live posts. The brand then has 72 hours to review.';
      } else {
        title = `${first} is working on it`;
        text = `Payment is held in escrow. You'll be asked to review as soon as ${first} delivers.`;
      }
      break;
    case 'DELIVERED':
      when = deadline(o.reviewBy, 'Review by');
      if (role === 'BRAND') {
        tone = 'warn';
        title = 'Delivered — please review';
        text = `Approve to release ${formatMoney(m.creatorPayoutCents, m.currency)} to ${first}, ask for changes (${left} revision${left === 1 ? '' : 's'} left), or open a dispute. If you do nothing, it is approved automatically.`;
      } else {
        title = 'Delivered — waiting for the brand';
        text = 'If the brand does nothing, the delivery is approved automatically and you are paid.';
      }
      break;
    case 'COMPLETED':
      tone = 'ok';
      icon = <LuCircleCheck aria-hidden />;
      title = 'Completed';
      text = role === 'CREATOR' ? `${formatMoney(m.creatorPayoutCents, m.currency)} was added to your balance.` : `${formatMoney(m.creatorPayoutCents, m.currency)} was released to ${first}.`;
      break;
    case 'DISPUTED':
      tone = 'danger';
      icon = <LuFlag aria-hidden />;
      title = 'Disputed — our team is reviewing';
      text = 'The money stays in escrow until we decide. We may contact both sides.';
      break;
    case 'REFUNDED':
      tone = 'neutral';
      icon = <LuRotateCcw aria-hidden />;
      title = 'Refunded';
      text = `${formatMoney(o.payment.refundedCents, m.currency)} was refunded to the brand.`;
      break;
    case 'CLOSED':
      tone = 'neutral';
      icon = <LuCircleX aria-hidden />;
      title = o.closeReason === 'DECLINED' ? 'Declined' : o.closeReason === 'EXPIRED' ? 'Expired' : 'Cancelled';
      text = 'The payment hold was released. The brand was not charged.';
      break;
  }

  // Phones: the main action stays in reach once the panel scrolls away (UX pass, item 4).
  const primary: { dialog: Exclude<Dialog, null>; label: string } | null = can('ACCEPT')
    ? { dialog: 'accept', label: 'Accept' }
    : can('DELIVER')
      ? { dialog: 'deliver', label: 'Deliver' }
      : can('APPROVE')
        ? { dialog: 'approve', label: 'Approve' }
        : null;

  return (
    <Card className={cx('next', `next--${tone}`)}>
      <div className="next__head">
        <span className="next__icon">{icon}</span>
        <div className="next__body">
          <h2 className="next__title">{title}</h2>
          {when}
          {o.late && role === 'BRAND' && <Badge tone="danger">Late</Badge>}
          <p className="small">{text}</p>
          {o.dispute && (
            <p className="small">
              <strong>Dispute reason:</strong> {o.dispute.reason}
            </p>
          )}
        </div>
      </div>

      <div className="next__actions" ref={actionsRef}>
        {can('ACCEPT') && (
          <Button onClick={() => setDialog('accept')}>
            <LuCircleCheck aria-hidden /> Accept order
          </Button>
        )}
        {can('DELIVER') && (
          <Button onClick={() => setDialog('deliver')}>
            <LuUpload aria-hidden /> Deliver work
          </Button>
        )}
        {can('APPROVE') && (
          <Button onClick={() => setDialog('approve')}>
            <LuThumbsUp aria-hidden /> Approve and pay
          </Button>
        )}
        {can('REQUEST_REVISION') && (
          <Button variant="secondary" onClick={() => setDialog('revision')}>
            <LuRotateCcw aria-hidden /> Request revision ({left} left)
          </Button>
        )}
        {can('DECLINE') && (
          <Button variant="secondary" onClick={() => setDialog('decline')}>
            Decline
          </Button>
        )}
        {can('DISPUTE') && (
          <Button variant="ghost" onClick={() => setDialog('dispute')}>
            <LuFlag aria-hidden /> Open a dispute
          </Button>
        )}
        {can('ADMIN_CANCEL') && <AdminCancel o={o} />}
        {can('CANCEL') && role === 'BRAND' && (
          <Button variant="ghost" onClick={() => setDialog('cancel')}>
            Cancel order
          </Button>
        )}
      </div>

      {primary && (
        <StickyBar label="Next step" watch={actionsRef}>
          <div className="sticky-bar__text">
            <strong>{title}</strong>
            {when}
          </div>
          <Button size="sm" onClick={() => setDialog(primary.dialog)}>
            {primary.label}
          </Button>
        </StickyBar>
      )}

      {dialog === 'deliver' ? (
        <DeliverDialog o={o} onClose={() => setDialog(null)} />
      ) : (
        <ConfirmDialog o={o} kind={dialog} first={first} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}

const DIALOGS = {
  accept: { title: 'Accept this order?', confirm: 'Accept order', note: null, needsNote: false },
  decline: { title: 'Decline this order?', confirm: 'Decline order', note: 'Reason (optional, shown to the brand)', needsNote: false },
  cancel: { title: 'Cancel this order?', confirm: 'Cancel order', note: 'Reason (optional)', needsNote: false },
  approve: { title: 'Approve and release payment?', confirm: 'Approve and pay', note: null, needsNote: false },
  revision: { title: 'Request a revision', confirm: 'Send request', note: 'What should change?', needsNote: true },
  dispute: { title: 'Open a dispute', confirm: 'Open dispute', note: 'What went wrong?', needsNote: true },
} as const;

function ConfirmDialog({ o, kind, first, onClose }: { o: OrderDetail; kind: Exclude<Dialog, 'deliver'>; first: string; onClose: () => void }) {
  const action = useOrderAction(o.id);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cfg = kind ? DIALOGS[kind] : null;
  const m = o.money;

  const explain: Record<Exclude<Dialog, 'deliver' | null>, string> = {
    accept: `The brand's payment of ${formatMoney(m.totalCents, m.currency)} is captured and held in escrow. Deliver within ${o.deliveryDays} days; you receive ${formatMoney(m.creatorPayoutCents, m.currency)} once the brand approves.`,
    decline: 'The payment hold is released and the brand is not charged. This cannot be undone.',
    cancel: 'The payment hold is released and you are not charged. This cannot be undone.',
    approve: `${formatMoney(m.creatorPayoutCents, m.currency)} is released to ${first}. This completes the order and cannot be undone.`,
    revision: `${first} gets at least 3 more days. You have ${o.maxRevisions - o.revisionCount} revision${o.maxRevisions - o.revisionCount === 1 ? '' : 's'} left.`,
    dispute: 'The money stays in escrow while our team reviews the order, the brief and the delivery. Try asking for a revision first if a change would fix it.',
  };

  const submit = async () => {
    if (!kind) return;
    setError(null);
    const map: Record<Exclude<Dialog, 'deliver' | null>, OrderActionInput> = {
      accept: { type: 'accept' },
      approve: { type: 'approve' },
      decline: { type: 'decline', reason: note.trim() || null },
      cancel: { type: 'cancel', reason: note.trim() || null },
      revision: { type: 'request-revision', note },
      dispute: { type: 'dispute', note },
    };
    try {
      await action.mutateAsync(map[kind]);
      setNote('');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Something went wrong. Try again.');
    }
  };

  return (
    <Drawer open={!!kind} onClose={onClose} title={cfg?.title ?? ''}>
      {kind && cfg && (
        <div className="form-stack">
          <p className="small">{explain[kind]}</p>
          {cfg.note && (
            <TextArea
              label={cfg.note}
              rows={4}
              value={note}
              maxLength={cfg.needsNote ? 2000 : 500}
              onChange={(e) => setNote(e.target.value)}
              hint={cfg.needsNote ? 'At least 10 characters.' : undefined}
            />
          )}
          <FormError>{error}</FormError>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button onClick={() => void submit()} loading={action.isPending} disabled={cfg.needsNote && note.trim().length < 10}>
              {cfg.confirm}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/**
 * FR-34: files and/or links to the live posts, plus a note. Phase C reuses it to share a draft for
 * approval before posting (`mode="draft"`): same items, no money or status change.
 */
export function DeliverDialog({ o, onClose, mode = 'deliver' }: { o: OrderDetail; onClose: () => void; mode?: 'deliver' | 'draft' }) {
  const action = useOrderAction(o.id);
  const collab = useCollab(o.id);
  const draft = mode === 'draft';
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLink = () => {
    const url = link.trim();
    if (!/^https:\/\/[^\s/]+\.[^\s]+/.test(url)) {
      setError('Paste the full post link, starting with https://');
      return;
    }
    setError(null);
    setItems((xs) => [...xs, { type: 'POST_URL', url, name: draft ? 'Preview link' : 'Post link' }]);
    setLink('');
  };

  const submit = async () => {
    setError(null);
    try {
      const body = { items, note: note.trim() || null };
      if (draft) await collab.mutateAsync({ type: 'share-draft', body });
      else await action.mutateAsync({ type: 'deliver', body });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not deliver. Try again.');
    }
  };

  return (
    <Drawer open onClose={onClose} title={draft ? 'Share a draft' : o.revisionCount ? `Deliver revision ${o.revisionCount}` : 'Deliver your work'}>
      <div className="form-stack">
        <p className="small muted">
          {draft
            ? 'Upload the draft video or images (or a private preview link) before you post. The brand approves it or asks for changes; nothing is paid yet.'
            : 'The brand has 72 hours to approve, ask for a revision or dispute. If they do nothing, it is approved and you are paid.'}
        </p>
        {items.length > 0 && (
          <ul className="list">
            {items.map((it, i) => (
              <li key={i} className="list__item">
                <div className="list__main">
                  <div className="list__title">{it.type === 'FILE' ? it.name ?? 'File' : it.url}</div>
                  <div className="list__meta">{it.type === 'FILE' ? 'Uploaded file' : 'Post link'}</div>
                </div>
                <Button variant="ghost" size="sm" icon onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                  <LuTrash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="deliver-add">
          <Input label={draft ? 'Preview link' : 'Link to the live post'} type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button variant="secondary" size="sm" onClick={addLink} disabled={!link.trim() || items.length >= 10}>
            <LuPlus aria-hidden /> Add link
          </Button>
        </div>
        {items.length < 10 && (
          <ImagePicker
            label="Or upload a file"
            purpose="DELIVERABLE"
            value={null}
            addOnly
            onChange={(url) => url && setItems((xs) => [...xs, { type: 'FILE', url, name: `File ${xs.filter((x) => x.type === 'FILE').length + 1}` }])}
            hint="Images in the prototype; large videos upload directly to storage in the real product."
          />
        )}
        <TextArea label="Note to the brand (optional)" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <FormError>{error}</FormError>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button onClick={() => void submit()} loading={action.isPending || collab.isPending} disabled={items.length === 0}>
            <LuUpload aria-hidden /> {draft ? 'Share draft' : 'Deliver'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
