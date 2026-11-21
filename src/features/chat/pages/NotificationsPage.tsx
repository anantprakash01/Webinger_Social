/** /notifications — the inbox (FR-52): one entry per order state change and campaign decision. */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LuBell, LuCheckCheck } from 'react-icons/lu';
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
      <div className="platform-tabs" role="group" aria-label="Show">
        <button type="button" className={cx('platform-tab', !unreadOnly && 'is-on')} aria-pressed={!unreadOnly} onClick={() => setParams({})}>
          All
        </button>
        <button type="button" className={cx('platform-tab', unreadOnly && 'is-on')} aria-pressed={unreadOnly} onClick={() => setParams({ filter: 'unread' })}>
          Unread {data ? <span className="tab-count">{data.unreadCount}</span> : null}
        </button>
      </div>
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
              {data.content.map((n) => (
                <li key={n.id}>
                  <button type="button" className={cx('note-item', !n.read && 'is-unread')} onClick={() => open(n)}>
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
                </li>
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
