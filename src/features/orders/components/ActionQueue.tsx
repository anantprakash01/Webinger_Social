/**
 * "Needs your action" (UX pass): the orders waiting on the viewer, nearest deadline first, at the top
 * of both dashboards. The order list API already sorts by urgency (contract v1.1).
 */
import { Link } from 'react-router-dom';
import { LuArrowRight, LuCircleCheck } from 'react-icons/lu';
import { CreatorPhoto } from '@/components/creator';
import { Card, cx } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderSummary, Role } from '@/types';
import { countdown, serverNow, viewerAmount } from '../format';
import { useOrders, useTicker } from '../hooks';

const OPEN = 'PENDING_ACCEPTANCE,IN_PROGRESS,DELIVERED';
const SHOWN = 5;

/** What the viewer has to do next, as a button label. */
function verb(o: OrderSummary, role: Role): string {
  if (role === 'CREATOR') return o.status === 'PENDING_ACCEPTANCE' ? 'Accept or decline' : o.status === 'IN_PROGRESS' ? 'Deliver' : 'Open';
  return o.status === 'DELIVERED' ? 'Review delivery' : 'Open';
}

function why(o: OrderSummary, role: Role): string {
  if (role === 'CREATOR') {
    if (o.status === 'PENDING_ACCEPTANCE') return 'New order — accept within 72 hours or it expires';
    if (o.status === 'IN_PROGRESS') return o.late ? 'Late — deliver as soon as you can' : 'Deliver before the due date';
  }
  if (o.status === 'DELIVERED') return 'Delivered — approve, ask for changes, or it auto-approves';
  return 'Waiting on you';
}

export function ActionQueue({ role, base }: { role: Role; base: string }) {
  const { data, isPending, isError, dataUpdatedAt } = useOrders(OPEN, 0);
  const deviceNow = useTicker();
  if (isPending || isError) return null;
  const todo = data.content.filter((o) => o.needsAction);
  const nowMs = serverNow(data.serverTime, dataUpdatedAt, deviceNow);

  if (todo.length === 0) {
    return (
      <div className="vetting vetting--ok" role="status">
        <LuCircleCheck aria-hidden />
        <div>
          <strong>You’re all caught up.</strong> Nothing is waiting on you right now.
        </div>
      </div>
    );
  }

  return (
    <Card
      title={
        <span className="row">
          Needs your action <span className="tab-count tab-count--alert">{todo.length}</span>
        </span>
      }
      action={
        todo.length > SHOWN ? (
          <Link to={base} className="link small">
            All orders
          </Link>
        ) : undefined
      }
      className="action-queue"
    >
      <ul className="list">
        {todo.slice(0, SHOWN).map((o) => {
          const c = o.nextDeadline ? countdown(o.nextDeadline.at, nowMs) : null;
          const party = role === 'CREATOR' ? o.brand : o.creator;
          return (
            <li key={o.id} className="list__item action-queue__item">
              <CreatorPhoto name={party.name} url={party.photoUrl} seed={party.username ?? party.name} size={36} className="order__photo" />
              <div className="list__main">
                <div className="list__title">
                  {o.title} <span className="muted">· {party.name}</span>
                </div>
                <div className="list__meta">
                  {why(o, role)}
                  {c && (
                    <>
                      {' · '}
                      <span className={cx(c.urgent && 'deadline--urgent')}>{c.text}</span>
                    </>
                  )}
                  {' · '}
                  {formatMoney(viewerAmount(o, role), o.money.currency)}
                </div>
              </div>
              <Link to={`${base}/${o.id}`} className={cx('btn btn--sm', c?.urgent ? 'btn--primary' : 'btn--secondary')}>
                {verb(o, role)} <LuArrowRight aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
