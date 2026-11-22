/**
 * /messages and /messages/:conversationId (FR-50, FR-51). One thread per order. Two panes on desktop;
 * on phones the list and the thread are separate screens.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuEyeOff, LuFileText, LuImage, LuPaperclip, LuSend, LuX } from 'react-icons/lu';
import { api } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import { CreatorPhoto } from '@/components/creator';
import { OrderStatusBadge } from '@/components/status';
import { ReportButton } from '@/features/admin/components/ReportButton';
import { Badge, Button, Card, EmptyState, ErrorState, FormError, PageHeader, cx } from '@/components/ui';
import type { Conversation, MessageAttachment } from '@/types';
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
            <EmptyState title="No conversations yet">Every order gets its own chat with the other side. Brands can also message a creator from their profile before booking.</EmptyState>
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
            <span className="conv__name">{c.kind === 'INQUIRY' ? c.counterparty.name : c.orderTitle}</span>
            {c.lastMessage && <span className="conv__time">{timeLabel(c.lastMessage.createdAt)}</span>}
          </span>
          <span className="conv__order">{c.kind === 'INQUIRY' ? 'Before booking' : c.counterparty.name}</span>
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
  // Phase D: one image or PDF per message, uploaded as soon as it is picked.
  const [attachment, setAttachment] = useState<MessageAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = msgs.data?.messages.length ?? 0;
  const orderPath = c.orderId ? `/${user?.role === 'CREATOR' ? 'creator' : user?.role === 'ADMIN' ? 'admin' : 'brand'}/orders/${c.orderId}` : null;
  const creatorName = c.counterparty.name.split(' ')[0];

  // Opening a thread (or new messages arriving in it) marks it read.
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (c.unreadCount > 0) markReadMutate(c.id);
  }, [c.id, c.unreadCount, markReadMutate]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [count, c.id]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setAttachError(null);
    setUploading(true);
    try {
      const url = await api.files.upload(file, 'MESSAGE_ATTACHMENT');
      setAttachment({ url, name: file.name.slice(0, 200), contentType: file.type as MessageAttachment['contentType'], sizeBytes: file.size });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Could not attach the file.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body && !attachment) return;
    try {
      await send.mutateAsync({ body, attachment });
      setText('');
      setAttachment(null);
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
          {orderPath ? (
            <Link to={orderPath} className="list__meta link">
              {c.orderTitle}
            </Link>
          ) : c.counterparty.username ? (
            <Link to={`/u/${c.counterparty.username}`} className="list__meta link">
              Before booking · view profile
            </Link>
          ) : (
            <span className="list__meta">Before booking</span>
          )}
        </div>
        {c.orderStatus ? <OrderStatusBadge status={c.orderStatus} /> : <Badge>Inquiry</Badge>}
      </header>

      {c.kind === 'INQUIRY' && user?.role === 'BRAND' && c.counterparty.username && (
        <div className="thread__book">
          <span className="small">Agreed on the details? Book so the work and payment are protected.</span>
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/u/${c.counterparty.username}#packages-h`} className="btn btn--secondary btn--sm">
              See packages
            </Link>
            <Link to={`/checkout/offer/${c.counterparty.username}`} className="btn btn--primary btn--sm">
              Send {creatorName} an offer
            </Link>
          </span>
        </div>
      )}
      {c.kind === 'INQUIRY' && user?.role === 'CREATOR' && (
        <div className="thread__book">
          <span className="small">This brand hasn’t booked yet. Answer their questions here; they can book one of your packages or send you a custom offer.</span>
        </div>
      )}

      {c.contactsHidden && (
        <div className="thread__notice" role="note">
          <LuEyeOff aria-hidden />
          <span>
            {c.kind === 'INQUIRY'
              ? 'Email addresses and phone numbers are hidden. Book through the platform so your payment is held in escrow.'
              : 'Email addresses and phone numbers are hidden until the order is completed. Keep payments on the platform so they stay protected by escrow.'}
          </span>
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
            {msgs.data.messages.map((m, i, all) => (
              <li key={m.id} className={cx('bubble', m.mine ? 'bubble--mine' : 'bubble--theirs')}>
                {!m.mine && <span className="sr-only">{m.senderName}: </span>}
                {m.body && <span className="bubble__body">{m.body}</span>}
                {m.attachment && <Attachment a={m.attachment} />}
                <span className="bubble__meta">
                  {m.masked && <Badge>Contact hidden</Badge>}
                  <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                  {/* Read receipt on the last message you sent (contract v1.1 readAt). */}
                  {m.mine && m.readAt && !all.slice(i + 1).some((x) => x.mine) && <span className="bubble__seen">Seen</span>}
                  {!m.mine && <ReportButton targetType="MESSAGE" targetId={m.id} what={`message from ${m.senderName}`} iconOnly className="bubble__report" />}
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
        <input ref={fileRef} id="composer-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button variant="ghost" icon onClick={() => fileRef.current?.click()} loading={uploading} aria-label="Attach an image or PDF" disabled={!!attachment}>
          <LuPaperclip aria-hidden />
        </Button>
        <Button type="submit" loading={send.isPending} disabled={(!text.trim() && !attachment) || uploading} aria-label="Send message">
          <LuSend aria-hidden /> <span className="composer__label">Send</span>
        </Button>
      </form>
      {attachment && (
        <div className="composer__pending">
          {attachment.contentType === 'application/pdf' ? <LuFileText aria-hidden /> : <LuImage aria-hidden />}
          <span>{attachment.name}</span>
          <Button variant="ghost" size="sm" icon onClick={() => setAttachment(null)} aria-label={`Remove ${attachment.name}`}>
            <LuX aria-hidden />
          </Button>
        </div>
      )}
      <FormError>{attachError ?? send.error?.message ?? null}</FormError>
    </Card>
  );
}

function Attachment({ a }: { a: MessageAttachment }) {
  const kb = a.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(a.sizeBytes / 1024))} KB` : `${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return a.contentType === 'application/pdf' ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="msg-attach link" download={a.name}>
      <LuFileText aria-hidden /> {a.name} <span className="muted small">· PDF, {kb}</span>
    </a>
  ) : (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="msg-attach">
      <img src={a.url} alt={a.name} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
