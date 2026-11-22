/**
 * Phase E: where the order is, at a glance — Placed → Accepted → Delivered → Completed, with the last
 * step replaced by what actually happened (closed, disputed, refunded). Dates come from the timeline.
 */
import { LuCheck } from 'react-icons/lu';
import { cx } from '@/components/ui';
import type { OrderDetail } from '@/types';

interface Step {
  label: string;
  at: string | null;
  state: 'done' | 'current' | 'todo' | 'stopped';
}

const CLOSE_LABEL = { DECLINED: 'Declined', EXPIRED: 'Expired', CANCELED: 'Cancelled' } as const;
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null);

export function stepsFor(o: Pick<OrderDetail, 'status' | 'events' | 'closeReason'>): Step[] {
  const first = (...types: string[]) => o.events.find((e) => types.includes(e.type))?.at ?? null;
  const last = (...types: string[]) => [...o.events].reverse().find((e) => types.includes(e.type))?.at ?? null;
  const placed: Step = { label: 'Placed', at: first('CREATE'), state: 'done' };
  const accepted = first('ACCEPT');
  const delivered = last('DELIVER');
  switch (o.status) {
    case 'PENDING_ACCEPTANCE':
      return [placed, { label: 'Accepted', at: null, state: 'current' }, { label: 'Delivered', at: null, state: 'todo' }, { label: 'Completed', at: null, state: 'todo' }];
    case 'IN_PROGRESS':
      return [placed, { label: 'Accepted', at: accepted, state: 'done' }, { label: o.events.some((e) => e.type === 'REQUEST_REVISION') ? 'Revising' : 'Delivered', at: null, state: 'current' }, { label: 'Completed', at: null, state: 'todo' }];
    case 'DELIVERED':
      return [placed, { label: 'Accepted', at: accepted, state: 'done' }, { label: 'Delivered', at: delivered, state: 'done' }, { label: 'Approval', at: null, state: 'current' }];
    case 'COMPLETED':
      return [placed, { label: 'Accepted', at: accepted, state: 'done' }, { label: 'Delivered', at: delivered, state: 'done' }, { label: 'Completed', at: last('APPROVE', 'AUTO_APPROVE', 'ADMIN_RELEASE'), state: 'done' }];
    case 'DISPUTED':
      return [placed, { label: 'Accepted', at: accepted, state: 'done' }, { label: 'Delivered', at: delivered, state: 'done' }, { label: 'In dispute', at: last('DISPUTE'), state: 'stopped' }];
    case 'REFUNDED':
      return [placed, { label: 'Accepted', at: accepted, state: 'done' }, ...(delivered ? [{ label: 'Delivered', at: delivered, state: 'done' as const }] : []), { label: 'Refunded', at: last('ADMIN_REFUND', 'ADMIN_CANCEL'), state: 'stopped' }];
    case 'CLOSED':
      return [placed, { label: o.closeReason ? CLOSE_LABEL[o.closeReason] : 'Closed', at: last('DECLINE', 'EXPIRE', 'CANCEL'), state: 'stopped' }];
  }
}

export function OrderStepper({ o }: { o: Pick<OrderDetail, 'status' | 'events' | 'closeReason'> }) {
  const steps = stepsFor(o);
  return (
    <ol className="stepper" aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s.label + i} className={cx('stepper__step', `is-${s.state}`)} aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className="stepper__dot" aria-hidden>
            {s.state === 'done' ? <LuCheck /> : i + 1}
          </span>
          <span className="stepper__label">
            {s.label}
            <span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current step)' : s.state === 'stopped' ? '' : ' (to do)'}</span>
          </span>
          {s.at && <span className="stepper__date">{shortDate(s.at)}</span>}
        </li>
      ))}
    </ol>
  );
}
