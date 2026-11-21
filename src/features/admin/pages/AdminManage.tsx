/** Admin management: users (FR-82), fees (FR-83), audit log (FR-84), order browser + demo controls. */
import { TabRow, toast, useConfirm } from '@/components/feedback';

import { useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatWhen } from '@/lib/dates';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuEye } from 'react-icons/lu';
import { api, isMock } from '@/api/client';
import { homePath } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { OrderStatusBadge, timeAgo } from '@/components/status';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton, Pagination, SearchInput, Select, TextArea, cx, type Tone } from '@/components/ui';
import { calculateFees } from '@/api/mock/fees';
import { formatMoney } from '@/lib/money';
import { useOrders, useSimulateTime } from '@/features/orders/hooks';
import { STATUS_FILTERS } from '@/features/orders/format';
import type { AdminUser, AuditAction, UserStatus } from '@/types';
import { ROLE_LABEL } from '@/types';
import { MAX_FEE_BPS } from '../schemas';
import { useAdminUsers, useAuditLog, useFees, useImpersonate, useUpdateFees, useUpdateUserStatus } from '../hooks';

const STATUS_TONE: Record<UserStatus, Tone> = { ACTIVE: 'ok', SUSPENDED: 'warn', BANNED: 'danger' };
const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: 'Active', SUSPENDED: 'Suspended', BANNED: 'Banned' };

/* ---------- Users (FR-82) ---------- */

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const role = params.get('role') ?? undefined;
  const status = params.get('status') ?? undefined;
  const page = Math.max(0, Number(params.get('page') ?? 1) - 1) || 0;
  const [text, setText] = useState(q);
  const { data, isPending, isError, error, refetch } = useAdminUsers({ q: q || undefined, role, status, page });
  const [open, setOpen] = useState<AdminUser | null>(null);
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    setParams(next);
  };
  // Search as you type, like the filters next to it (debounced; the URL keeps the query).
  useEffect(() => {
    const next = text.trim();
    if (next === q) return undefined;
    const t = setTimeout(() => set({ q: next || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text restarts the timer
  }, [text]);

  return (
    <div className="page">
      <PageHeader eyebrow="Admin" title="Users" />
      <form
        className="row admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: text.trim() || undefined });
        }}
      >
        <SearchInput label="Search users" value={text} onChange={setText} placeholder="Name, email, company or username" />
        <Select label="Role" hideLabel value={role} onChange={(v) => set({ role: v })} options={(['BRAND', 'CREATOR', 'ADMIN'] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} allLabel="Any role" />
        <Select
          label="Status"
          hideLabel
          value={status}
          onChange={(v) => set({ status: v })}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'SUSPENDED', label: 'Suspended' },
            { value: 'BANNED', label: 'Banned' },
          ]}
          allLabel="Any status"
        />
      </form>
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No users match" />
        </Card>
      ) : (
        <Card flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Orders</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((u) => (
                  <tr key={u.id}>
                    <td className="td--title" data-label="User">
                      <div className="list__title">{u.name}</div>
                      <div className="list__meta">
                        {u.email}
                        {u.label && ` · ${u.label}`}
                      </div>
                    </td>
                    <td data-label="Role">{ROLE_LABEL[u.role]}</td>
                    <td data-label="Status">
                      <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                    </td>
                    <td data-label="Joined">{formatWhen(u.createdAt)}</td>
                    <td data-label="Last active">{u.lastActiveAt ? formatWhen(u.lastActiveAt) : <span className="muted">Never</span>}</td>
                    <td data-label="Orders">{u.orderCount}</td>
                    <td data-label="Actions">
                      <Button variant="secondary" size="sm" onClick={() => setOpen(u)} aria-label={`Manage ${u.name}`}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalElements} size={data.size} onPage={(p) => setParams({ ...Object.fromEntries(params), page: String(p + 1) })} />
          </div>
        </Card>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Manage ${open.name}` : ''}>
        {open && <ManageUser u={open} onDone={() => setOpen(null)} />}
      </Drawer>
    </div>
  );
}

function ManageUser({ u, onDone }: { u: AdminUser; onDone: () => void }) {
  const update = useUpdateUserStatus();
  const impersonate = useImpersonate();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const change = (status: UserStatus) => update.mutate({ id: u.id, body: { status, reason: reason.trim() } }, { onSuccess: onDone });
  return (
    <div className="form-stack">
      <dl className="money">
        <dt>Email</dt>
        <dd>{u.email}</dd>
        <dt>Role</dt>
        <dd>{ROLE_LABEL[u.role]}</dd>
        <dt>Status</dt>
        <dd>
          <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
        </dd>
        <dt>Joined</dt>
        <dd>{timeAgo(u.createdAt)}</dd>
        <dt>Last active</dt>
        <dd>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'Never'}</dd>
      </dl>
      {u.role !== 'ADMIN' && (
        <Card title="See what they see">
          <p className="small muted">Opens their workspace read-only. Nothing can be changed, and the session is logged.</p>
          <FormError>{impersonate.error?.message}</FormError>
          <Button variant="secondary" size="sm" loading={impersonate.isPending} onClick={() => impersonate.mutate(u.id, { onSuccess: (me) => navigate(homePath(me)) })}>
            <LuEye aria-hidden /> View as {u.name.split(' ')[0]} (read-only)
          </Button>
        </Card>
      )}
      <TextArea label="Reason (shown in the audit log)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="At least 10 characters." />
      <FormError>{update.error?.message}</FormError>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {u.status !== 'ACTIVE' && (
          <Button size="sm" disabled={reason.trim().length < 10} loading={update.isPending} onClick={() => change('ACTIVE')}>
            Reactivate
          </Button>
        )}
        {u.status !== 'SUSPENDED' && (
          <Button size="sm" variant="secondary" disabled={reason.trim().length < 10} loading={update.isPending} onClick={() => change('SUSPENDED')}>
            Suspend
          </Button>
        )}
        {u.status !== 'BANNED' && (
          <Button size="sm" variant="ghost" disabled={reason.trim().length < 10} loading={update.isPending} onClick={() => change('BANNED')}>
            Ban
          </Button>
        )}
      </div>
      <p className="small muted">Suspending or banning signs them out everywhere. Creators disappear from search until reactivated.</p>
    </div>
  );
}

/* ---------- Fees (FR-83) ---------- */

export function AdminFeesPage() {
  const { data, isPending, isError, error, refetch } = useFees();
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader eyebrow="Admin" title="Fees & plans" />
      <div className="brand-profile">
        <Card title="Free plan">
          <FeeForm key={data.current.effectiveFrom} brand={data.current.brandFeeBps} creator={data.current.creatorFeeBps} />
        </Card>
        <Card title="History">
          <ul className="list">
            {data.history.map((h) => (
              <li key={h.effectiveFrom} className="list__item">
                <div className="list__main">
                  <div className="list__title">
                    Brand {h.brandFeeBps / 100}% · Creator {h.creatorFeeBps / 100}%
                  </div>
                  <div className="list__meta">
                    From {formatDate(h.effectiveFrom)}
                    {h.changedBy && ` · ${h.changedBy}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function FeeForm({ brand, creator }: { brand: number; creator: number }) {
  const update = useUpdateFees();
  const confirm = useConfirm();
  const [b, setB] = useState(String(brand));
  const [c, setC] = useState(String(creator));
  const parse = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const bn = parse(b);
  const cn = parse(c);
  const err = (n: number) => (Number.isNaN(n) ? 'Whole basis points only.' : n > MAX_FEE_BPS ? `At most ${MAX_FEE_BPS} bps.` : undefined);
  const valid = !err(bn) && !err(cn);
  const example = valid ? calculateFees(20_000, { brandFeeBps: bn, creatorFeeBps: cn }) : null;
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        const ok = await confirm.ask({ title: 'Apply the new fees?', body: `Brand ${bn / 100}% and creator ${cn / 100}% apply to every new order from now on. Existing orders keep the fees they were placed with.`, confirmLabel: 'Apply fees' });
        if (ok) update.mutate({ brandFeeBps: bn, creatorFeeBps: cn }, { onSuccess: () => toast('Fees updated for new orders') });
      }}
    >
      <div className="form-row">
        <Input label="Brand fee (bps)" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} error={err(bn)} hint={!err(bn) ? `= ${bn / 100}% added at checkout` : undefined} />
        <Input label="Creator fee (bps)" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} error={err(cn)} hint={!err(cn) ? `= ${cn / 100}% deducted from payouts` : undefined} />
      </div>
      {example && (
        <div className="payment-line small">
          On a $200 package: brand pays <strong>{formatMoney(example.brandTotalCents)}</strong>, creator receives <strong>{formatMoney(example.creatorPayoutCents)}</strong>, platform keeps{' '}
          <strong>{formatMoney(example.platformGrossCents)}</strong> before Stripe fees.
        </div>
      )}
      <FormError>{update.error?.message}</FormError>
      <div className="row">
        <Button type="submit" disabled={!valid || (bn === brand && cn === creator)} loading={update.isPending}>
          Save fees
        </Button>
      </div>
      <p className="small muted">Fees are copied onto each order at checkout, so changes never alter existing orders.</p>
      {confirm.dialog}
    </form>
  );
}

/* ---------- Audit log (FR-84) ---------- */

const ACTIONS: AuditAction[] = ['MONEY_MOVEMENT', 'PAYOUT_SENT', 'DISPUTE_RESOLVED', 'CREATOR_APPROVED', 'CREATOR_REJECTED', 'USER_STATUS_CHANGED', 'IMPERSONATION_STARTED', 'FEES_CHANGED', 'REPORT_RESOLVED'];

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? undefined;
  const page = Math.max(0, Number(params.get('page') ?? 1) - 1) || 0;
  const { data, isPending, isError, error, refetch } = useAuditLog(action, page);
  return (
    <div className="page">
      <PageHeader eyebrow="Admin" title="Audit log" />
      <p className="small muted">Every admin action and money movement, newest first. Entries cannot be edited or deleted.</p>
      <Select label="Action" value={action} onChange={(v) => setParams(v ? { action: v } : {})} options={ACTIONS.map((a) => ({ value: a, label: a.replace(/_/g, ' ').toLowerCase() }))} allLabel="All actions" />
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No entries" />
        </Card>
      ) : (
        <Card flush>
          <div className="card__body">
            <ul className="audit">
              {data.content.map((a) => (
                <li key={a.id} className="audit__item">
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <Badge tone={a.action === 'MONEY_MOVEMENT' || a.action === 'PAYOUT_SENT' ? 'info' : 'neutral'}>{a.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <span className="list__meta">
                      {formatDateTime(a.at)} · {a.actorName}
                      {a.ip && ` · ${a.ip}`}
                    </span>
                  </div>
                  <div className="small">{a.summary}</div>
                  <details className="audit__details">
                    <summary className="small link">
                      {a.entityType} {a.entityId.slice(-8)} — details
                    </summary>
                    <pre>{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalElements} size={data.size} onPage={(p) => setParams({ ...(action && { action }), page: String(p + 1) })} />
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Order browser + demo controls ---------- */

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const filterKey = STATUS_FILTERS.some((f) => f.key === params.get('status')) ? params.get('status')! : 'all';
  const filter = STATUS_FILTERS.find((f) => f.key === filterKey)!;
  const page = Math.max(0, Number(params.get('page') ?? 1) - 1) || 0;
  const { data, isPending, isError, error, refetch } = useOrders(filter.statuses.join(','), page);
  const sim = useSimulateTime();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);
  const confirm = useConfirm();

  return (
    <div className="page">
      <PageHeader
        eyebrow="Admin"
        title="Orders"
        actions={
          isMock ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" loading={sim.isPending} onClick={() => sim.mutate(73)}>
                Simulate +73 hours
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={resetting}
                onClick={async () => {
                  if (!(await confirm.ask({ title: 'Reset all demo data?', body: 'Every change made in this tab is lost.', confirmLabel: 'Reset demo data' }))) return;
                  setResetting(true);
                  await api.dev.reset();
                  navigate('/login', { replace: true, state: { notice: 'Demo data was reset.' } });
                }}
              >
                Reset demo data
              </Button>
            </div>
          ) : undefined
        }
      />
      {confirm.dialog}
      {sim.data && (
        <p className="small" role="status">
          Clock moved to +{sim.data.offsetHours} h: {sim.data.expired} expired, {sim.data.autoApproved} auto-approved.
        </p>
      )}
      <TabRow label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} type="button" className={cx('platform-tab', f.key === filterKey && 'is-on')} aria-pressed={f.key === filterKey} onClick={() => setParams(f.key === 'all' ? {} : { status: f.key })}>
            {f.label}
          </button>
        ))}
      </TabRow>
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No orders" />
        </Card>
      ) : (
        <Card flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Brand → creator</th>
                  <th scope="col">Status</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((o) => (
                  <tr key={o.id}>
                    <td className="td--title" data-label="Order">
                      <Link to={`/admin/orders/${o.id}`} className="row-link">
                        {o.title}
                      </Link>
                      <div className="list__meta">{timeAgo(o.updatedAt)}</div>
                    </td>
                    <td data-label="Parties">
                      <span className="row">
                        <CreatorPhoto name={o.creator.name} url={o.creator.photoUrl} seed={o.creator.username ?? o.creator.name} size={24} className="order__photo" />
                        <span className="small">
                          {o.brand.name} → {o.creator.name}
                        </span>
                      </span>
                    </td>
                    <td data-label="Status">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td data-label="Total">{formatMoney(o.money.totalCents, o.money.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalElements} size={20} onPage={(p) => setParams({ ...(filterKey !== 'all' && { status: filterKey }), page: String(p + 1) })} />
          </div>
        </Card>
      )}
    </div>
  );
}
