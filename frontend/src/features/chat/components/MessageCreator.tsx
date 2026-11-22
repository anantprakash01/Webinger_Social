/**
 * v3.0 "Message before booking": a brand writes to a creator before paying. Opens the existing inquiry
 * if there is one; otherwise a drawer for the first message, with the plan's monthly allowance.
 * Rendered only for signed-in brands.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuEyeOff, LuMessageCircle } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Button, Drawer, FormError, TextArea } from '@/components/ui';
import { formatWhen } from '@/lib/dates';
import { ApiError } from '@/types';
import { useInquiryAllowance, useStartInquiry } from '../hooks';
import { inquiryInputSchema, MAX_MESSAGE_LENGTH } from '../schemas';

export function MessageCreator({ username, name, inquiryId }: { username: string; name: string; inquiryId: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (user?.role !== 'BRAND') return null;
  const first = name.split(' ')[0];
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => (inquiryId ? navigate(`/messages/${inquiryId}`) : setOpen(true))}>
        <LuMessageCircle aria-hidden /> Message
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Message ${first}`}>
        {open && <FirstMessage username={username} first={first} onSent={(id) => navigate(`/messages/${id}`)} />}
      </Drawer>
    </>
  );
}

function FirstMessage({ username, first, onSent }: { username: string; first: string; onSent: (conversationId: string) => void }) {
  const allowance = useInquiryAllowance();
  const start = useStartInquiry();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const a = allowance.data;
  const used = a && a.limit !== null && a.used >= a.limit;

  const send = async () => {
    const v = inquiryInputSchema.safeParse({ creatorUsername: username, body: text });
    if (!v.success) return setError(v.error.issues[0].message);
    setError(null);
    try {
      const c = await start.mutateAsync(v.data);
      onSent(c.id);
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not send the message.');
    }
  };

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="small">
        Ask {first} about availability, ideas or a custom price before you book. When you are ready, book a package or send a custom offer — payment stays in escrow.
      </p>
      <TextArea
        label="Your message"
        rows={5}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={`Hi ${first}, we're launching a monsoon range in July and would love two Reels. Are you free that month?`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="small muted row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <LuEyeOff aria-hidden style={{ flex: 'none', marginTop: 3 }} />
        <span>Email addresses and phone numbers are hidden. Paying outside the platform loses escrow protection.</span>
      </p>
      {a && a.limit !== null && (
        <p className="small muted">
          {used ? (
            <>
              You have used all {a.limit} new conversations on your plan{a.resetsAt ? ` until ${formatWhen(a.resetsAt)}` : ''}.{' '}
              <Link to="/brand/plan" className="link">
                Upgrade for more
              </Link>
            </>
          ) : (
            `${a.limit - a.used} of ${a.limit} new conversations left this month.`
          )}
        </p>
      )}
      <FormError>{error}</FormError>
      <Button type="submit" loading={start.isPending} disabled={!!used}>
        Send message
      </Button>
    </form>
  );
}
