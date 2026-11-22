/**
 * Phase D brand tools on creator profiles and cards: save to a list (FR-25) and invite to a campaign (FR-43).
 * Rendered only for signed-in brands.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuBookmark, LuBookmarkCheck, LuMailPlus, LuPlus } from 'react-icons/lu';
import { useAuth } from '@/app/AuthContext';
import { Button, Drawer, EmptyState, FormError, Input, TextArea } from '@/components/ui';
import { useCampaigns } from '@/features/campaigns/hooks';
import { ApiError } from '@/types';
import { useInvite, useListMutations, useSavedLists } from '../hooks';
import { savedListInputSchema } from '../schemas';

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : fallback);

/** Bookmark button + drawer with the brand's lists as checkboxes and a "new list" field. */
export function SaveToList({ username, name, compact }: { username: string; name: string; compact?: boolean }) {
  const { user } = useAuth();
  const lists = useSavedLists();
  const [open, setOpen] = useState(false);
  if (user?.role !== 'BRAND') return null;
  const saved = (lists.data ?? []).some((l) => l.usernames.includes(username));
  const Icon = saved ? LuBookmarkCheck : LuBookmark;
  return (
    <>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size="sm"
        icon={compact}
        aria-pressed={saved}
        onClick={() => setOpen(true)}
        aria-label={compact ? `${saved ? 'Saved' : 'Save'} ${name} to a list` : undefined}
        className={compact ? 'save-btn' : undefined}
      >
        <Icon aria-hidden />
        {!compact && (saved ? 'Saved' : 'Save')}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Save ${name.split(' ')[0]} to a list`}>
        {open && <ListPicker username={username} />}
      </Drawer>
    </>
  );
}

function ListPicker({ username }: { username: string }) {
  const lists = useSavedLists();
  const m = useListMutations();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = async (id: string, on: boolean) => {
    setError(null);
    try {
      if (on) await m.add.mutateAsync({ id, username });
      else await m.drop.mutateAsync({ id, username });
    } catch (e) {
      setError(errorText(e, 'Could not update the list.'));
    }
  };
  const create = async () => {
    const v = savedListInputSchema.safeParse({ name: newName });
    if (!v.success) return setError(v.error.issues[0].message);
    setError(null);
    try {
      const l = await m.create.mutateAsync(v.data.name);
      await m.add.mutateAsync({ id: l.id, username });
      setNewName('');
    } catch (e) {
      setError(errorText(e, 'Could not create the list.'));
    }
  };

  return (
    <div className="form-stack">
      {lists.isPending ? (
        <p className="small muted">Loading your lists…</p>
      ) : (lists.data ?? []).length === 0 ? (
        <p className="small muted">You have no lists yet. Create one to shortlist creators for a launch or a campaign.</p>
      ) : (
        <ul className="list-picker">
          {lists.data!.map((l) => {
            const on = l.usernames.includes(username);
            return (
              <li key={l.id}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={(e) => void toggle(l.id, e.target.checked)} />
                  <span>
                    {l.name} <span className="muted small">· {l.usernames.length}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="deliver-add">
        <Input label="New list" placeholder="e.g. Diwali launch shortlist" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
        <Button variant="secondary" size="sm" onClick={() => void create()} loading={m.create.isPending} disabled={!newName.trim()}>
          <LuPlus aria-hidden /> Create and save
        </Button>
      </div>
      <FormError>{error}</FormError>
      <Link to="/brand/lists" className="link small">
        Manage saved lists →
      </Link>
    </div>
  );
}

/** "Invite to campaign" button + drawer choosing one of the brand's open campaigns. */
export function InviteToCampaign({ username, name, away }: { username: string; name: string; away?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (user?.role !== 'BRAND') return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={away} title={away ? `${name} is away` : undefined}>
        <LuMailPlus aria-hidden /> Invite to campaign
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Invite ${name.split(' ')[0]} to a campaign`}>
        {open && <InviteForm username={username} onDone={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

function InviteForm({ username, onDone }: { username: string; onDone: () => void }) {
  const campaigns = useCampaigns();
  const invite = useInvite();
  const open = (campaigns.data?.content ?? []).filter((c) => c.open);
  const [campaignId, setCampaignId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chosen = campaignId || open[0]?.id || '';

  if (campaigns.isPending) return <p className="small muted">Loading your campaigns…</p>;
  if (open.length === 0)
    return (
      <EmptyState title="No open campaigns">
        <Link to="/brand/campaigns" className="link">
          Post a campaign
        </Link>{' '}
        first, then invite creators to apply.
      </EmptyState>
    );

  const submit = async () => {
    setError(null);
    try {
      await invite.mutateAsync({ campaignId: chosen, username, message: message.trim() || null });
      onDone();
    } catch (e) {
      setError(errorText(e, 'Could not send the invitation.'));
    }
  };

  return (
    <div className="form-stack">
      <div className="field">
        <label className="field__label" htmlFor="invite-campaign">
          Campaign
        </label>
        <select id="invite-campaign" className="field__input" value={chosen} onChange={(e) => setCampaignId(e.target.value)}>
          {open.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <TextArea label="Message (optional)" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} hint="Why they'd be a good fit. They still apply with their own pitch and price." />
      <FormError>{error}</FormError>
      <div className="row">
        <Button onClick={() => void submit()} loading={invite.isPending}>
          Send invitation
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
