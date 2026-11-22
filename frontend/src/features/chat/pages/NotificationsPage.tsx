/** /notifications — the inbox (FR-52): one entry per order state change and campaign decision. */
import { TabRow } from '@/components/feedback';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { LuBell, LuCheck, LuCheckCheck, LuChevronDown } from 'react-icons/lu';
import { timeAgo } from '@/components/status';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, cx } from '@/components/ui';
import type { AppNotification } from '@/types';
import { useMarkNotificationsRead, useNotifications } from '../hooks';

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('filter') === 'unread';
  const page = Math.max(0, Number(params.get('page') ?? 1) - 1) || 0;
  const { data, isPending, isError, error, refetch } = useNotifications(unreadOnly, page);
  const mark = useMarkNotificationsRead();
  const navigate = useNavigate();

  const open = (n: AppNotification) => {
    if (!n.read) mark.mutate({ ids: [n.id] });
    if (n.link) navigate(n.link);
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader
        title="Notifications"
        actions={
          data && data.unreadCount > 0 ? (
            <Button variant="secondary" size="sm" loading={mark.isPending} onClick={() => mark.mutate({ all: true })}>
              <LuCheckCheck aria-hidden /> Mark all as read
            </Button>
          ) : undefined
        }
      />
      <TabRow label="Show">
        <button type="button" className={cx('platform-tab', !unreadOnly && 'is-on')} aria-pressed={!unreadOnly} onClick={() => setParams({})}>
          All
        </button>
        <button type="button" className={cx('platform-tab', unreadOnly && 'is-on')} aria-pressed={unreadOnly} onClick={() => setParams({ filter: 'unread' })}>
          Unread {data ? <span className="tab-count">{data.unreadCount}</span> : null}
        </button>
      </TabRow>
      <Card flush>
        {isError ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="card__body">
            <div className="skeleton" style={{ height: 200 }} />
          </div>
        ) : data.content.length === 0 ? (
          <EmptyState title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}>Order updates and campaign news appear here.</EmptyState>
        ) : (
          <>
            <ul className="notes">
              {groupByOrder(data.content).map((g) => (
                <NoteGroup key={g.key} items={g.items} onOpen={open} onMarkRead={(ids) => mark.mutate({ ids })} />
              ))}
            </ul>
            <div className="card__body">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                totalItems={data.totalElements}
                size={data.size}
                onPage={(p) => setParams({ ...(unreadOnly && { filter: 'unread' }), page: String(p + 1) })}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** The order a notification is about, from its link (/brand/orders/:id, /creator/orders/:id). */
const orderOf = (n: AppNotification) => /\/orders\/([^/?#]+)/.exec(n.link ?? '')?.[1] ?? null;

/** Phase E: notifications about the same order (newest first on this page) are shown together. */
export function groupByOrder(list: AppNotification[]): Array<{ key: string; items: AppNotification[] }> {
  const groups: Array<{ key: string; items: AppNotification[] }> = [];
  const byOrder = new Map<string, { key: string; items: AppNotification[] }>();
  for (const n of list) {
    const o = orderOf(n);
    const existing = o ? byOrder.get(o) : undefined;
    if (existing) existing.items.push(n);
    else {
      const g = { key: o ?? n.id, items: [n] };
      groups.push(g);
      if (o) byOrder.set(o, g);
    }
  }
  return groups;
}

function NoteGroup({ items, onOpen, onMarkRead }: { items: AppNotification[]; onOpen: (n: AppNotification) => void; onMarkRead: (ids: string[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [head, ...rest] = items;
  const unreadRest = rest.filter((n) => !n.read).length;
  return (
    <li className="note-group">
      <NoteItem n={head} onOpen={onOpen} onMarkRead={onMarkRead} />
      {rest.length > 0 && (
        <>
          <button type="button" className="note-group__toggle link small" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <LuChevronDown aria-hidden className={cx('note-group__chev', expanded && 'is-open')} />
            {expanded ? 'Hide' : 'Show'} {rest.length} earlier update{rest.length === 1 ? '' : 's'} on this order
            {unreadRest > 0 && !expanded && <span className="tab-count">{unreadRest}</span>}
          </button>
          {expanded && (
            <ul className="notes notes--nested">
              {rest.map((n) => (
                <li key={n.id}>
                  <NoteItem n={n} onOpen={onOpen} onMarkRead={onMarkRead} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function NoteItem({ n, onOpen, onMarkRead }: { n: AppNotification; onOpen: (n: AppNotification) => void; onMarkRead: (ids: string[]) => void }) {
  return (
    <div className="note-row">
      <button type="button" className={cx('note-item', !n.read && 'is-unread')} onClick={() => onOpen(n)}>
        <span className="note-item__icon" aria-hidden>
          <LuBell />
        </span>
        <span className="note-item__main">
          <span className="note-item__title">
            {!n.read && <span className="sr-only">Unread: </span>}
            {n.title}
          </span>
          <span className="note-item__body">{n.body}</span>
        </span>
        <time className="note-item__time" dateTime={n.createdAt}>
          {timeAgo(n.createdAt)}
        </time>
      </button>
      {!n.read && (
        <Button variant="ghost" size="sm" icon className="note-row__read" onClick={() => onMarkRead([n.id])} aria-label={`Mark “${n.title}” as read`} title="Mark as read">
          <LuCheck aria-hidden />
        </Button>
      )}
    </div>
  );
}
