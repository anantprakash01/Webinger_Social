/** Read-mostly sections of the order detail page. */
import { formatWhen } from '@/lib/dates';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LuCheck, LuExternalLink, LuFileImage, LuLink, LuPencil, LuStar } from 'react-icons/lu';
import { PlatformLabel, Stars } from '@/components/creator';
import { Badge, Button, Card, Drawer, FormError, TextArea, cx } from '@/components/ui';
import { COUNTRY_LABEL } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { ApiError, type OrderDetail, type Role } from '@/types';
import { eventLabel, formatDateTime, paymentText } from '../format';
import { useReplyToReview, useReviewOrder, useUpdateBrief } from '../hooks';
import { emptyCheckoutForm, formFieldFor, makeCheckoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '../schemas';
import { BriefFields } from './BriefFields';

/* ---------- Payment and fees ---------- */

export function MoneyCard({ o, role }: { o: OrderDetail; role: Role }) {
  const m = o.money;
  return (
    <Card title="Payment">
      <dl className="money">
        <dt>Price</dt>
        <dd>{formatMoney(m.priceCents, m.currency)}</dd>
        {role === 'CREATOR' ? (
          <>
            <dt>Platform fee</dt>
            <dd>−{formatMoney(m.creatorFeeCents, m.currency)}</dd>
            <dt className="money__total">You receive</dt>
            <dd className="money__total">{formatMoney(m.creatorPayoutCents, m.currency)}</dd>
          </>
        ) : (
          <>
            <dt>Service fee</dt>
            <dd>{formatMoney(m.brandFeeCents, m.currency)}</dd>
            <dt className="money__total">Total</dt>
            <dd className="money__total">{formatMoney(m.totalCents, m.currency)}</dd>
            <dt className="muted">Creator receives</dt>
            <dd className="muted">{formatMoney(m.creatorPayoutCents, m.currency)}</dd>
            <dt className="muted">Paid with</dt>
            <dd className="muted">{o.payment.methodLabel}</dd>
          </>
        )}
      </dl>
      <p className="small payment-line">{paymentText(o, role)}</p>
    </Card>
  );
}

/* ---------- Timeline (order_events) ---------- */

export function Timeline({ o }: { o: OrderDetail }) {
  return (
    <Card title="Timeline">
      <ol className="timeline">
        {o.events.map((e, i) => (
          <li key={i} className={cx('timeline__item', i === o.events.length - 1 && 'is-last')}>
            <span className="timeline__dot" aria-hidden />
            <div>
              <div className="small">{eventLabel(e, o)}</div>
              {e.note && <div className="timeline__note">“{e.note}”</div>}
              <time className="list__meta" dateTime={e.at}>
                {formatDateTime(e.at)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ---------- What was ordered (snapshot) ---------- */

export function OrderedCard({ o }: { o: OrderDetail }) {
  return (
    <Card title="What was ordered">
      <div className="form-stack">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <PlatformLabel platform={o.platform} />
          {o.kind === 'CUSTOM_OFFER' && <Badge tone="info">Custom offer</Badge>}
        </div>
        <ul className="package__deliverables">
          {o.deliverables.map((d) => (
            <li key={d}>
              <LuCheck aria-hidden /> {d}
            </li>
          ))}
        </ul>
        <span className="small muted">
          Delivery within {o.deliveryDays} day{o.deliveryDays === 1 ? '' : 's'} of acceptance · up to {o.maxRevisions} revisions
        </span>
      </div>
    </Card>
  );
}

/* ---------- Deliveries (FR-34) ---------- */

export function Deliveries({ o }: { o: OrderDetail }) {
  if (o.deliveries.length === 0) return null;
  return (
    <Card title="Deliveries">
      <ul className="deliveries">
        {o.deliveries.map((d, i) => (
          <li key={d.id} className={cx('delivery', i === 0 && 'is-latest')}>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <strong className="small">{d.revisionNo === 0 ? 'First delivery' : `Revision ${d.revisionNo}`}</strong>
              {i === 0 && <Badge tone="info">Latest</Badge>}
              <span className="list__meta">{formatWhen(d.submittedAt)}</span>
            </div>
            {d.note && <p className="small delivery__note">{d.note}</p>}
            <ul className="delivery__items">
              {d.items.map((it, j) =>
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
                      <LuLink aria-hidden /> {it.name ?? 'Post'} <LuExternalLink aria-hidden />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ),
              )}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Brief (FR-33), editable by the brand before delivery ---------- */

export function BriefCard({ o }: { o: OrderDetail }) {
  const [editing, setEditing] = useState(false);
  const b = o.brief;
  const canEdit = o.allowedActions.includes('EDIT_BRIEF');
  return (
    <Card
      title="Brief"
      action={
        canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <LuPencil aria-hidden /> Edit
          </Button>
        ) : undefined
      }
    >
      <div className="form-stack">
        <p className="brief__text">{b.requirements}</p>
        {b.links && b.links.length > 0 && (
          <ul className="brief__links">
            {b.links.map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noopener noreferrer" className="link small">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
        {b.referenceFiles && b.referenceFiles.length > 0 && (
          <ul className="ref-files">
            {b.referenceFiles.map((u, i) => (
              <li key={u + i}>
                <a href={u} target="_blank" rel="noopener noreferrer">
                  <img src={u} alt={`Reference image ${i + 1}`} />
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">
          {b.needsShipping
            ? `Product will be shipped${b.shippingAddress ? ` from ${b.shippingAddress.city}, ${COUNTRY_LABEL[b.shippingAddress.country] ?? b.shippingAddress.country}` : ''}.`
            : 'No product needs to be shipped.'}
        </p>
      </div>
      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit brief">
        {editing && <BriefEditor o={o} onDone={() => setEditing(false)} />}
      </Drawer>
    </Card>
  );
}

function BriefEditor({ o, onDone }: { o: OrderDetail; onDone: () => void }) {
  const save = useUpdateBrief(o.id);
  const [formError, setFormError] = useState<string | null>(null);
  const b = o.brief;
  const a = b.shippingAddress;
  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(makeCheckoutSchema({ offer: false, card: false })),
    defaultValues: emptyCheckoutForm({
      requirements: b.requirements,
      linksText: (b.links ?? []).join('\n'),
      referenceFiles: b.referenceFiles ?? [],
      needsShipping: b.needsShipping,
      shipName: a?.name ?? '',
      shipLine1: a?.line1 ?? '',
      shipLine2: a?.line2 ?? '',
      shipCity: a?.city ?? '',
      shipPostal: a?.postalCode ?? '',
      shipCountry: a?.country ?? '',
    }),
  });
  const onSubmit = form.handleSubmit(async (v) => {
    setFormError(null);
    try {
      await save.mutateAsync(v.brief!);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) for (const fe of e.fieldErrors) {
        const f = formFieldFor(`brief.${fe.field}`);
        if (f) form.setError(f, { message: fe.message });
      }
      setFormError(e instanceof Error ? e.message : 'Could not save the brief.');
    }
  });
  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <FormError>{formError}</FormError>
      <BriefFields form={form} />
      <div className="row">
        <Button type="submit" loading={save.isPending}>
          Save brief
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ---------- Review and reply (FR-38) ---------- */

export function ReviewCard({ o, role }: { o: OrderDetail; role: Role }) {
  const canReview = o.allowedActions.includes('REVIEW');
  const canReply = o.allowedActions.includes('REPLY');
  if (!o.review && !canReview) return null;
  return (
    <Card title="Review">
      {o.review ? (
        <div className="form-stack">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Stars value={o.review.rating} />
            <span className="list__meta">
              {o.review.brandName} · {formatWhen(o.review.createdAt)}
            </span>
          </div>
          {o.review.comment && <p className="small">{o.review.comment}</p>}
          {o.review.creatorReply ? (
            <div className="review__reply">
              <Badge>Creator reply</Badge> <span className="small">{o.review.creatorReply}</span>
            </div>
          ) : canReply && role === 'CREATOR' ? (
            <ReplyForm reviewId={o.review.id} />
          ) : null}
        </div>
      ) : (
        <ReviewForm orderId={o.id} name={o.counterparty.name} />
      )}
    </Card>
  );
}

function ReviewForm({ orderId, name }: { orderId: string; name: string }) {
  const review = useReviewOrder(orderId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (rating < 1) {
      setError('Choose 1 to 5 stars.');
      return;
    }
    try {
      await review.mutateAsync({ rating, comment: comment.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your review.');
    }
  };
  return (
    <div className="form-stack">
      <fieldset className="star-input">
        <legend className="field__label">How was working with {name.split(' ')[0]}?</legend>
        <div className="star-input__row">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={cx('star-input__star', n <= rating && 'is-on')}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <LuStar aria-hidden />
              <span className="sr-only">
                {n} star{n === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea label="Comment (optional)" rows={3} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} hint="Shown on the creator’s public profile." />
      <FormError>{error}</FormError>
      <Button onClick={() => void submit()} loading={review.isPending} style={{ justifySelf: 'start' }}>
        Post review
      </Button>
    </div>
  );
}

function ReplyForm({ reviewId }: { reviewId: string }) {
  const reply = useReplyToReview();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await reply.mutateAsync({ reviewId, reply: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your reply.');
    }
  };
  return (
    <div className="form-stack">
      <TextArea label="Reply publicly (once)" rows={2} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
      <FormError>{error}</FormError>
      <Button variant="secondary" size="sm" onClick={() => void submit()} loading={reply.isPending} disabled={text.trim().length < 2} style={{ justifySelf: 'start' }}>
        Post reply
      </Button>
    </div>
  );
}
