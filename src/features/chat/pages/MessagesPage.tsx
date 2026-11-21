/**
 * /messages and /messages/:conversationId (FR-50, FR-51). One thread per order. Two panes on desktop;
 * on phones the list and the thread are separate screens.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuEyeOff, LuSend } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { OrderStatusBadge } from '@/components/status';
import { Badge, Button, Card, EmptyState, ErrorState, FormError, PageHeader, cx } from '@/components/ui';
import type { Conversation } from '@/types';
import { MAX_MESSAGE_LENGTH } from '../schemas';
import { useConversations, useMarkConversationRead, useMessages, useSendMessage } from '../hooks';

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function MessagesPage() {
  const { conversationId } = useParams();
  const list = useConversations();
  const active = list.data?.content.find((c) => c.id === conversationId);

  return (
    <div className={cx('page chat', conversationId && 'chat--thread-open')}>
      <PageHeader title="Messages" />
      <div className="chat__layout">
        <aside className="chat__list" aria-label="Conversations">
          {list.isError ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : list.isPending ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : list.data.content.length === 0 ? (
            <EmptyState title="No conversations yet">Every order gets its own chat with the other side.</EmptyState>
          ) : (
            <ul className="convs">
              {list.data.content.map((c) => (
                <ConversationRow key={c.id} c={c} active={c.id === conversationId} />
              ))}
            </ul>
          )}
        </aside>
        <section className="chat__thread" aria-label="Conversation">
          {conversationId ? (
            active ? (
              <Thread c={active} />
            ) : list.isPending ? (
              <div className="skeleton" style={{ height: 320 }} />
            ) : (
              <Card>
                <EmptyState title="Conversation not found">
                  <Link to="/messages" className="link">
                    All messages
                  </Link>
                </EmptyState>
              </Card>
            )
          ) : (
            <Card className="chat__placeholder">
              <EmptyState title="Choose a conversation">Messages are kept per order, so the whole history stays next to the work.</EmptyState>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationRow({ c, active }: { c: Conversation; active: boolean }) {
  return (
    <li>
      <Link to={`/messages/${c.id}`} className={cx('conv', active && 'is-active', c.unreadCount > 0 && 'is-unread')} aria-current={active ? 'page' : undefined}>
        <CreatorPhoto name={c.counterparty.name} url={c.counterparty.photoUrl} seed={c.counterparty.username ?? c.counterparty.name} size={40} className="order__photo" />
        <span className="conv__main">
          <span className="conv__top">
            <span className="conv__name">{c.counterparty.name}</span>
            {c.lastMessage && <span className="conv__time">{timeLabel(c.lastMessage.createdAt)}</span>}
          </span>
          <span className="conv__order">{c.orderTitle}</span>
          <span className="conv__last">{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body}` : 'No messages yet'}</span>
        </span>
        {c.unreadCount > 0 && (
          <span className="count-badge" aria-label={`${c.unreadCount} unread`}>
            {c.unreadCount}
          </span>
        )}
      </Link>
    </li>
  );
}

function Thread({ c }: { c: Conversation }) {
  const { user } = useAuth();
  const msgs = useMessages(c.id);
  const send = useSendMessage(c.id);
  const markRead = useMarkConversationRead();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = msgs.data?.messages.length ?? 0;
  const orderPath = `/${user?.role === 'CREATOR' ? 'creator' : 'brand'}/orders/${c.orderId}`;

  // Opening a thread (or new messages arriving in it) marks it read.
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (c.unreadCount > 0) markReadMutate(c.id);
  }, [c.id, c.unreadCount, markReadMutate]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [count, c.id]);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await send.mutateAsync(body);
      setText('');
    } catch {
      /* shown below */
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Card className="thread" flush>
      <header className="thread__head">
        <Link to="/messages" className="thread__back" aria-label="All conversations">
          <LuArrowLeft aria-hidden />
        </Link>
        <CreatorPhoto name={c.counterparty.name} url={c.counterparty.photoUrl} seed={c.counterparty.username ?? c.counterparty.name} size={36} className="order__photo" />
        <div className="thread__who">
          <div className="list__title">{c.counterparty.name}</div>
          <Link to={orderPath} className="list__meta link">
            {c.orderTitle}
          </Link>
        </div>
        <OrderStatusBadge status={c.orderStatus} />
      </header>

      {c.contactsHidden && (
        <div className="thread__notice" role="note">
          <LuEyeOff aria-hidden />
          <span>Email addresses and phone numbers are hidden until the order is completed. Keep payments on the platform so they stay protected by escrow.</span>
        </div>
      )}

      <div className="thread__messages" aria-live="polite">
        {msgs.isError ? (
          <ErrorState message={msgs.error.message} onRetry={() => void msgs.refetch()} />
        ) : msgs.isPending ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : count === 0 ? (
          <p className="small muted thread__empty">No messages yet. Say hello and agree the details here.</p>
        ) : (
          <ol className="bubbles">
            {msgs.data.messages.map((m) => (
              <li key={m.id} className={cx('bubble', m.mine ? 'bubble--mine' : 'bubble--theirs')}>
                {!m.mine && <span className="sr-only">{m.senderName}: </span>}
                <span className="bubble__body">{m.body}</span>
                <span className="bubble__meta">
                  {m.masked && <Badge>Contact hidden</Badge>}
                  <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="composer-input" className="sr-only">
          Message {c.counterparty.name}
        </label>
        <textarea
          id="composer-input"
          className="field__input field__input--area composer__input"
          rows={2}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <Button type="submit" loading={send.isPending} disabled={!text.trim()} aria-label="Send message">
          <LuSend aria-hidden /> <span className="composer__label">Send</span>
        </Button>
      </form>
      <FormError>{send.error?.message}</FormError>
    </Card>
  );
}
