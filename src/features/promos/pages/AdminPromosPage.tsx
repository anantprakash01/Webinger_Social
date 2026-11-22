/** /admin/promos — platform-funded promo codes for brands (v3.3). */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from '@/components/feedback';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton, TextArea, type Tone } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { formatMoney, parseAmount } from '@/lib/money';
import { ApiError, type PromoCode, type PromoCodeInput } from '@/types';
import { promoCodeInputSchema } from '../schemas';

const STATUS_TONE: Record<PromoCode['status'], Tone> = { ACTIVE: 'ok', PAUSED: 'neutral', EXPIRED: 'neutral', USED_UP: 'warn' };
const STATUS_LABEL: Record<PromoCode['status'], string> = { ACTIVE: 'Active', PAUSED: 'Paused', EXPIRED: 'Expired', USED_UP: 'Used up' };

const offerOf = (p: PromoCode) =>
  `${p.kind === 'FLAT' ? `${formatMoney(p.flatCents ?? 0)} off` : `${(p.percentBps ?? 0) / 100}% off${p.maxDiscountCents ? ` (max ${formatMoney(p.maxDiscountCents)})` : ''}`}${p.minOrderCents ? ` · min ${formatMoney(p.minOrderCents)}` : ''}${p.firstOrderOnly ? ' · first order' : ''}`;

export function AdminPromosPage() {
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['admin', 'promos'], queryFn: () => api.admin.promos() });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => api.admin.setPromoActive(v.id, v.active),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
      toast(`${p.code} ${p.active ? 'turned on' : 'paused'}`);
    },
  });
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <PageHeader
        title="Promo codes"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            New code
          </Button>
        }
      />
      <p className="small muted">The platform pays for every discount: the creator’s payout and the fees are unchanged. Codes are given back when an order is not accepted or is fully refunded.</p>
      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <PageSkeleton />
      ) : data.content.length === 0 ? (
        <Card>
          <EmptyState title="No promo codes yet" />
        </Card>
      ) : (
        <Card flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Offer</th>
                  <th scope="col">Used</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((p) => (
                  <tr key={p.id}>
                    <td className="td--title" data-label="Code">
                      <strong>{p.code}</strong>
                      <div className="list__meta">{p.description}</div>
                    </td>
                    <td data-label="Offer" className="small">
                      {offerOf(p)}
                      {p.validUntil && <div className="list__meta">Until {formatDate(`${p.validUntil}T23:59:59`)}</div>}
                    </td>
                    <td data-label="Used" className="small">
                      {p.redemptions}
                      {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''} · {formatMoney(p.discountGivenCents)}
                    </td>
                    <td data-label="Status">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td data-label="">
                      {(p.status === 'ACTIVE' || p.status === 'PAUSED') && (
                        <Button size="sm" variant="secondary" loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate({ id: p.id, active: !p.active })}>
                          {p.active ? 'Pause' : 'Turn on'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Drawer open={creating} onClose={() => setCreating(false)} title="New promo code">
        {creating && <PromoForm onDone={() => setCreating(false)} />}
      </Drawer>
    </div>
  );
}

function PromoForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ code: '', description: '', kind: 'FLAT' as 'FLAT' | 'PERCENT', amount: '', percent: '', max: '', min: '', firstOrderOnly: false, maxRedemptions: '', validUntil: '' });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: PromoCodeInput) => api.admin.createPromo(body),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'promos'] });
      toast(`${p.code} created`);
      onDone();
    },
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const submit = async () => {
    const body = {
      code: v.code,
      description: v.description,
      kind: v.kind,
      percentBps: v.kind === 'PERCENT' && v.percent ? Math.round(Number(v.percent) * 100) : null,
      flatCents: v.kind === 'FLAT' ? parseAmount(v.amount) : null,
      maxDiscountCents: v.max ? parseAmount(v.max) : null,
      minOrderCents: v.min ? parseAmount(v.min) : null,
      firstOrderOnly: v.firstOrderOnly,
      maxRedemptions: v.maxRedemptions ? Number(v.maxRedemptions) : null,
      validUntil: v.validUntil || null,
    };
    const r = promoCodeInputSchema.safeParse(body);
    if (!r.success) return setError(r.error.issues[0].message);
    setError(null);
    try {
      await create.mutateAsync(r.data as PromoCodeInput);
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not create the code.');
    }
  };
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Input label="Code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} hint="4–20 letters and numbers, e.g. LAUNCH300." maxLength={20} />
      <TextArea label="Description (for the team)" rows={2} value={v.description} onChange={set('description')} />
      <fieldset className="radio-stack">
        <legend className="field__label">Discount</legend>
        <label className="check small">
          <input type="radio" name="kind" checked={v.kind === 'FLAT'} onChange={() => setV({ ...v, kind: 'FLAT' })} /> Fixed amount
        </label>
        <label className="check small">
          <input type="radio" name="kind" checked={v.kind === 'PERCENT'} onChange={() => setV({ ...v, kind: 'PERCENT' })} /> Percentage of the price
        </label>
      </fieldset>
      {v.kind === 'FLAT' ? (
        <Input label="Amount off (₹)" inputMode="decimal" value={v.amount} onChange={set('amount')} />
      ) : (
        <div className="form-row">
          <Input label="Percent off" inputMode="decimal" value={v.percent} onChange={set('percent')} hint="1 to 50." />
          <Input label="Up to (₹, optional)" inputMode="decimal" value={v.max} onChange={set('max')} />
        </div>
      )}
      <div className="form-row">
        <Input label="Minimum order price (₹, optional)" inputMode="decimal" value={v.min} onChange={set('min')} />
        <Input label="Total uses (optional)" inputMode="numeric" value={v.maxRedemptions} onChange={set('maxRedemptions')} />
      </div>
      <Input label="Last valid day (optional)" type="date" value={v.validUntil} onChange={set('validUntil')} />
      <label className="check small">
        <input type="checkbox" checked={v.firstOrderOnly} onChange={(e) => setV({ ...v, firstOrderOnly: e.target.checked })} /> First order only
      </label>
      <p className="small muted">Each brand can use a code once. The brand always pays at least ₹1.</p>
      <FormError>{error}</FormError>
      <Button type="submit" loading={create.isPending}>
        Create code
      </Button>
    </form>
  );
}
