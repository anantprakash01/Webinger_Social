/** Admin queues: vetting (FR-80), disputes (FR-81), reports (FR-85). */
import { TabRow } from '@/components/feedback';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuExternalLink } from 'react-icons/lu';
import { api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { CreatorPhoto, PlatformIcon, VerifiedBadge, placeLabel } from '@/components/creator';
import { VettingBadge, timeAgo } from '@/components/status';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton, Stat, TextArea, cx } from '@/components/ui';
import { BriefCard, Deliveries, Timeline } from '@/features/orders/components/OrderParts';
import { DISPUTE_REASON_LABEL, DisputeCard, RESOLUTION_REASON_LABEL } from '@/features/orders/components/DisputeCard';
import { RESOLUTION_REASONS } from '@/features/orders/schemas';
import { formatCompact, NICHE_LABEL, PLATFORM_LABEL } from '@/lib/catalog';
import { formatMoney, parseAmount } from '@/lib/money';
import type { AdminDispute, Report, ResolveDisputeRequest, VettingItem } from '@/types';
import { REPORT_REASONS } from '../schemas';
import { useDisputeReport, useDisputes, useReports, useResolveDispute, useResolveReport, useVettingDecision, useVettingQueue } from '../hooks';

function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <TabRow label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('platform-tab', value === o.value && 'is-on')} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </TabRow>
  );
}

/* ---------- Vetting (FR-80) ---------- */

const REJECT_PRESETS = ['Please link at least one public account we can verify.', 'Add a clear profile photo of yourself.', 'Your bio needs more detail about what you create.'];

export function AdminVettingPage() {
  const [status, setStatus] = useState<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'>('PENDING_REVIEW');
  const { data, isPending, isError, error, refetch } = useVettingQueue(status);
  return (
    <div className="page">
      <PageHeader title="Vetting queue" />
      <Tabs
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING_REVIEW', label: 'Waiting for review' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
      />
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title={status === 'PENDING_REVIEW' ? 'Nothing to review' : 'No creators here'}>New submissions appear here, oldest first.</EmptyState>
        </Card>
      ) : (
        <div className="admin-stack">
          {data.content.map((c) => (
            <VettingCard key={c.creatorId} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function VettingCard({ c }: { c: VettingItem }) {
  const decide = useVettingDecision();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pending = c.vettingStatus === 'PENDING_REVIEW';
  // After a decision the card leaves the queue; move focus to the next one so reviewers can keep going.
  const focusNext = () => {
    const next = document.getElementById(`vet-${c.creatorId}`)?.nextElementSibling as HTMLElement | null;
    if (next) setTimeout(() => {
      next.focus();
      next.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }, 50);
  };
  return (
    <div className="vet-card" id={`vet-${c.creatorId}`} tabIndex={-1} aria-label={`${c.displayName}, ${c.vettingStatus === 'PENDING_REVIEW' ? 'waiting for review' : c.vettingStatus.toLowerCase()}`}>
    <Card>
      <div className="vet">
        <div className="vet__head">
          <CreatorPhoto name={c.displayName} url={c.photoUrl} seed={c.username ?? c.displayName} size={56} className="order__photo" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="list__title">{c.displayName}</div>
            <div className="list__meta">
              @{c.username ?? '—'} · {c.email} · {placeLabel(c.city, c.country) || '—'}
            </div>
            <div className="list__meta">{c.submittedAt ? `Submitted ${timeAgo(c.submittedAt)}` : `Joined ${timeAgo(c.createdAt)}`}</div>
          </div>
          <VettingBadge status={c.vettingStatus} />
        </div>
        {c.bio && <p className="small application__pitch">{c.bio}</p>}
        <div className="vet__grid">
          <div>
            <div className="field__label">Social accounts</div>
            <ul className="list">
              {c.socials.map((s) => (
                <li key={s.id} className="list__item small">
                  <PlatformIcon platform={s.platform} /> {PLATFORM_LABEL[s.platform]} @{s.handle} · {formatCompact(s.followers)} {s.verified ? <VerifiedBadge /> : <Badge tone="warn">Check</Badge>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="field__label">Packages</div>
            <ul className="list">
              {c.packages.map((k) => (
                <li key={k.id} className="list__item small">
                  {k.title} · {formatMoney(k.priceCents, k.currency)} · {k.deliveryDays} d{!k.active && ' (off)'}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="field__label">Niches and portfolio</div>
            <p className="small">{c.niches.map((n) => NICHE_LABEL[n]).join(', ') || '—'}</p>
            <p className="small muted">{c.portfolio.length} portfolio item{c.portfolio.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {c.rejectionReason && <p className="small">Rejection note: “{c.rejectionReason}”</p>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {c.username && (
            <Link to={`/u/${c.username}`} className="btn btn--ghost btn--sm" target="_blank" rel="noopener">
              Preview profile <LuExternalLink aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </Link>
          )}
          {pending && (
            <>
              <Button size="sm" loading={decide.isPending && decide.variables?.decision === 'APPROVE'} onClick={() => {
                  focusNext();
                  decide.mutate({ id: c.creatorId, decision: 'APPROVE' });
                }}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
                Reject…
              </Button>
            </>
          )}
        </div>
        <FormError>{decide.error?.message}</FormError>
      </div>
      <Drawer open={rejecting} onClose={() => setRejecting(false)} title={`Reject ${c.displayName}`}>
        <div className="form-stack">
          <p className="small muted">The creator sees this note and can fix their profile and resubmit.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {REJECT_PRESETS.map((p) => (
              <button key={p} type="button" className="tag" onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <TextArea label="Reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} hint="At least 10 characters." />
          <FormError>{decide.error?.message}</FormError>
          <Button
            disabled={reason.trim().length < 10}
            loading={decide.isPending}
            onClick={() =>
              decide.mutate(
                { id: c.creatorId, decision: 'REJECT', reason: reason.trim() },
                {
                  onSuccess: () => {
                    setRejecting(false);
                    focusNext();
                  },
                },
              )
            }
          >
            Reject with this note
          </Button>
        </div>
      </Drawer>
    </Card>
    </div>
  );
}

/* ---------- Disputes (FR-81) ---------- */

export function AdminDisputesPage() {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'REASONS'>('OPEN');
  const { data, isPending, isError, error, refetch } = useDisputes(status === 'REASONS' ? 'RESOLVED' : status);
  return (
    <div className="page">
      <PageHeader title="Disputes" />
      <Tabs
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'OPEN', label: 'Open' },
          { value: 'RESOLVED', label: 'Resolved' },
          { value: 'REASONS', label: 'Refund reasons' },
        ]}
      />
      {status === 'REASONS' ? (
        <DisputeReasons />
      ) : isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title={status === 'OPEN' ? 'No open disputes' : 'No resolved disputes yet'} />
        </Card>
      ) : (
        <Card flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Opened</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((d) => (
                  <tr key={d.id}>
                    <td className="td--title" data-label="Order">
                      <Link to={`/admin/disputes/${d.id}`} className="row-link">
                        {d.orderTitle}
                      </Link>
                      <div className="list__meta">
                        {d.brand.name} → {d.creator.name}
                      </div>
                    </td>
                    <td data-label="Reason" className="small">
                      <strong>{DISPUTE_REASON_LABEL[d.reasonCode]}</strong>
                      <div className="list__meta">{d.reason}</div>
                    </td>
                    <td data-label="Amount">{formatMoney(d.money.totalCents, d.money.currency)}</td>
                    <td data-label="Opened" className="small">
                      {timeAgo(d.openedAt)}
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {d.brandPlan === 'PREMIUM' && d.status === 'OPEN' && <Badge tone="info">Premium · first</Badge>}
                        {d.status === 'OPEN' && (d.creatorResponse ? <Badge tone="ok">Creator responded</Badge> : <Badge>Awaiting creator</Badge>)}
                        {d.resolution && <Badge>{d.resolution.replace('_', ' ').toLowerCase()}</Badge>}
                        {d.resolutionReason && <Badge>{RESOLUTION_REASON_LABEL[d.resolutionReason]}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function AdminDisputeDetailPage() {
  const { id = '' } = useParams();
  const list = useDisputes();
  const d = list.data?.content.find((x) => x.id === id);
  const order = useQuery({ queryKey: ['orders', 'detail', d?.orderId], queryFn: () => api.orders.get(d!.orderId), enabled: !!d });
  const chat = useQuery({
    queryKey: ['chat', 'messages', order.data?.conversationId],
    queryFn: () => api.chat.messages(order.data!.conversationId),
    enabled: !!order.data?.conversationId,
  });

  if (list.isPending || (d && order.isPending)) return <PageSkeleton />;
  if (list.isError) return <div className="page"><ErrorState message={list.error.message} onRetry={() => void list.refetch()} /></div>;
  if (!d) return <div className="page"><Card><EmptyState title="Dispute not found"><Link to="/admin/disputes" className="link">All disputes</Link></EmptyState></Card></div>;
  if (order.isError) return <div className="page"><ErrorState message={order.error.message} onRetry={() => void order.refetch()} /></div>;
  const o = order.data!;

  return (
    <div className="page">
      <Link to="/admin/disputes" className="link small back-link">
        <LuArrowLeft aria-hidden /> All disputes
      </Link>
      <PageHeader eyebrow={`${d.brand.name} → ${d.creator.name}`} title={d.orderTitle} />
      <div className="order__layout">
        <div className="order__main">
          {o.dispute && <DisputeCard o={o} d={o.dispute} role="ADMIN" />}
          <Deliveries o={o} role="ADMIN" />
          <BriefCard o={o} />
          <Card title="Chat between brand and creator">
            {chat.isPending ? (
              <div className="skeleton" style={{ height: 80 }} />
            ) : chat.data && chat.data.messages.length > 0 ? (
              <ol className="transcript">
                {chat.data.messages.map((m) => (
                  <li key={m.id}>
                    <strong className="small">{m.senderName}</strong> <span className="list__meta">{timeAgo(m.createdAt)}</span>
                    <p className="small">{m.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="small muted">No messages.</p>
            )}
          </Card>
        </div>
        <aside className="order__side">
          <ResolvePanel d={d} serverTime={o.serverTime} />
          <Timeline o={o} />
        </aside>
      </div>
    </div>
  );
}

function ResolvePanel({ d, serverTime }: { d: AdminDispute; serverTime: string }) {
  const resolve = useResolveDispute(d.id);
  const [resolution, setResolution] = useState<'RELEASE' | 'FULL_REFUND' | 'PARTIAL_REFUND'>('RELEASE');
  const [reason, setReason] = useState<ResolveDisputeRequest['resolutionReason'] | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const m = d.money;
  const refundCents = parseAmount(amount);
  const amountError = resolution === 'PARTIAL_REFUND' && amount && (refundCents === null || refundCents < 1 || refundCents > m.creatorPayoutCents) ? `Enter 0.01 to ${formatMoney(m.creatorPayoutCents, m.currency)}.` : undefined;
  const ready = note.trim().length >= 10 && !!reason && (resolution !== 'PARTIAL_REFUND' || (!!refundCents && !amountError));
  const creatorCanStillRespond = !d.creatorResponse && d.respondBy > serverTime;

  if (d.status === 'RESOLVED') {
    return (
      <Card title="Decision">
        <p className="small">
          <strong>{d.resolution?.replace('_', ' ').toLowerCase()}</strong>
          {d.refundCents ? ` — ${formatMoney(d.refundCents, m.currency)} refunded` : ''}
        </p>
        {d.resolutionNote && <p className="small muted">“{d.resolutionNote}”</p>}
      </Card>
    );
  }
  return (
    <Card title="Decide">
      <div className="form-stack">
        <dl className="money">
          <dt>Brand paid</dt>
          <dd>{formatMoney(m.totalCents, m.currency)}</dd>
          <dt>Creator would receive</dt>
          <dd>{formatMoney(m.creatorPayoutCents, m.currency)}</dd>
        </dl>
        <fieldset className="radio-stack">
          <legend className="field__label">Outcome</legend>
          {(
            [
              ['RELEASE', 'Release to the creator', `${formatMoney(m.creatorPayoutCents, m.currency)} to the creator.`],
              ['FULL_REFUND', 'Full refund to the brand', `${formatMoney(m.totalCents, m.currency)} back, including the service fee.`],
              ['PARTIAL_REFUND', 'Partial refund', "Taken from the creator's share; the rest is released."],
            ] as const
          ).map(([v, label, hint]) => (
            <label key={v} className={cx('radio-card', resolution === v && 'is-on')}>
              <input type="radio" name="resolution" value={v} checked={resolution === v} onChange={() => setResolution(v)} />
              <span>
                <strong className="small">{label}</strong>
                <span className="list__meta">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {resolution === 'PARTIAL_REFUND' && <Input label="Refund amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError} />}
        <div className="field">
          <label className="field__label" htmlFor="resolution-reason">
            Reason (for the refund-reason log)
          </label>
          <select id="resolution-reason" className="field__input" value={reason} onChange={(e) => setReason(e.target.value as ResolveDisputeRequest['resolutionReason'])}>
            <option value="">Choose a reason…</option>
            {RESOLUTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <TextArea label="Decision note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="Shown to both sides and kept in the audit log." />
        {creatorCanStillRespond && (
          <p className="note note--warn small" role="note">
            The creator can still respond until {new Date(d.respondBy).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Deciding now is allowed, but wait unless it is urgent.
          </p>
        )}
        <FormError>{resolve.error?.message}</FormError>
        <Button
          disabled={!ready}
          loading={resolve.isPending}
          onClick={() => reason && resolve.mutate({ resolution, resolutionReason: reason, refundCents: resolution === 'PARTIAL_REFUND' ? refundCents : null, note: note.trim() })}
        >
          Confirm decision
        </Button>
      </div>
    </Card>
  );
}

/** v3.1 refund-reason log: resolved disputes by outcome and reason. */
function DisputeReasons() {
  const [days, setDays] = useState(90);
  const { data, isPending, isError, error, refetch } = useDisputeReport(days);
  if (isError) return <ErrorState message={error.message} onRetry={() => void refetch()} />;
  if (isPending) return <PageSkeleton />;
  const r = data;
  const max = Math.max(1, ...r.byReason.map((x) => x.count));
  return (
    <div className="admin-stack">
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="field__label" htmlFor="report-days">
          Period
        </label>
        <select id="report-days" className="field__input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>
      <div className="grid grid--stats">
        <Stat label="Resolved" value={r.resolved} hint={`${r.open} still open`} />
        <Stat label="Released to creators" value={r.released} />
        <Stat label="Refunded" value={r.fullRefunds + r.partialRefunds} hint={`${r.fullRefunds} full · ${r.partialRefunds} partial`} />
        <Stat label="Money refunded" value={formatMoney(r.refundedCents, 'INR')} hint={r.avgHoursToResolve !== null ? `Avg ${r.avgHoursToResolve} h to decide` : undefined} accent />
      </div>
      <Card title="Why we decided as we did">
        {r.byReason.length === 0 ? (
          <EmptyState title="No resolved disputes in this period" />
        ) : (
          <table className="table table--rows">
            <thead>
              <tr>
                <th scope="col">Reason</th>
                <th scope="col">Disputes</th>
                <th scope="col">Refunded</th>
              </tr>
            </thead>
            <tbody>
              {r.byReason.map((x) => (
                <tr key={x.reason}>
                  <td data-label="Reason">
                    {RESOLUTION_REASON_LABEL[x.reason]}
                    <div className="reason-bar" aria-hidden>
                      <span style={{ width: `${(x.count / max) * 100}%` }} />
                    </div>
                  </td>
                  <td data-label="Disputes">{x.count}</td>
                  <td data-label="Refunded">{formatMoney(x.refundedCents, 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="What brands said went wrong">
        {r.byBrandReason.length === 0 ? (
          <p className="small muted">No disputes opened in this period.</p>
        ) : (
          <ul className="reason-list">
            {r.byBrandReason.map((x) => (
              <li key={x.reasonCode} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small">{DISPUTE_REASON_LABEL[x.reasonCode]}</span>
                <strong className="small">{x.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------- Reports (FR-85) ---------- */

const REASON_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export function AdminReportsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'OPEN') as 'OPEN' | 'DISMISSED' | 'ACTION_TAKEN';
  const { data, isPending, isError, error, refetch } = useReports(status);
  return (
    <div className="page">
      <PageHeader title="Reports" />
      <Tabs
        label="Status"
        value={status}
        onChange={(v) => setParams({ status: v })}
        options={[
          { value: 'OPEN', label: 'Open' },
          { value: 'ACTION_TAKEN', label: 'Action taken' },
          { value: 'DISMISSED', label: 'Dismissed' },
        ]}
      />
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No reports here" />
        </Card>
      ) : (
        <div className="admin-stack">
          {data.content.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ r }: { r: Report }) {
  const resolve = useResolveReport();
  const [note, setNote] = useState('');
  return (
    <Card>
      <div className="form-stack">
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Badge tone={r.status === 'OPEN' ? 'warn' : 'neutral'}>{REASON_LABEL[r.reason]}</Badge>
          <span className="list__meta">
            Reported by {r.reporterName} · {timeAgo(r.createdAt)}
          </span>
        </div>
        <div className="list__title">
          {r.targetLink ? (
            <Link to={r.targetLink} className="link">
              {r.targetLabel}
            </Link>
          ) : (
            r.targetLabel
          )}
        </div>
        {r.details && <p className="small application__pitch">{r.details}</p>}
        {r.status === 'OPEN' ? (
          <>
            <TextArea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <FormError>{resolve.variables?.id === r.id ? resolve.error?.message : null}</FormError>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" disabled={note.trim().length < 5} loading={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, body: { status: 'ACTION_TAKEN', note: note.trim() } })}>
                Action taken
              </Button>
              <Button size="sm" variant="secondary" disabled={note.trim().length < 5} loading={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, body: { status: 'DISMISSED', note: note.trim() } })}>
                Dismiss
              </Button>
            </div>
          </>
        ) : (
          <p className="small muted">{r.resolutionNote}</p>
        )}
      </div>
    </Card>
  );
}
