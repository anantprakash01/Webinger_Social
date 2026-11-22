/** /brand/lists and /brand/lists/:id — saved lists of creators (FR-25). */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuBookmark, LuPencil, LuPlus, LuTrash2, LuX } from 'react-icons/lu';
import { toast, useConfirm } from '@/components/feedback';
import { Button, Card, Drawer, EmptyState, ErrorState, FormError, Input, PageHeader, PageSkeleton } from '@/components/ui';
import { formatWhen } from '@/lib/dates';
import { CreatorCard } from '@/features/search/components/CreatorCard';
import { ApiError, type SavedList } from '@/types';
import { InviteToCampaign } from '../components/BrandTools';
import { useListMutations, useSavedList, useSavedLists } from '../hooks';
import { savedListInputSchema } from '../schemas';

export function SavedListsPage() {
  const lists = useSavedLists();
  const [editing, setEditing] = useState<SavedList | 'new' | null>(null);
  return (
    <div className="page">
      <PageHeader
        title="Saved lists"
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <LuPlus aria-hidden /> New list
          </Button>
        }
      />
      {lists.isPending ? (
        <PageSkeleton />
      ) : lists.isError ? (
        <ErrorState message={lists.error.message} onRetry={() => void lists.refetch()} />
      ) : lists.data.length === 0 ? (
        <Card>
          <EmptyState title="No saved lists yet">
            Press <LuBookmark aria-hidden style={{ verticalAlign: 'middle' }} /> <strong>Save</strong> on a creator's profile or search card to shortlist them.{' '}
            <Link to="/search" className="link">
              Find creators
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <ul className="lists-grid">
          {lists.data.map((l) => (
            <li key={l.id}>
              <Card>
                <Link to={`/brand/lists/${l.id}`} className="list__title link lists-grid__name">
                  {l.name}
                </Link>
                <div className="list__meta">
                  {l.usernames.length} creator{l.usernames.length === 1 ? '' : 's'} · updated {formatWhen(l.updatedAt)}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New list' : 'Rename list'}>
        {editing && <ListNameForm list={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </div>
  );
}

function ListNameForm({ list, onDone }: { list: SavedList | null; onDone: () => void }) {
  const m = useListMutations();
  const [name, setName] = useState(list?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const v = savedListInputSchema.safeParse({ name });
    if (!v.success) return setError(v.error.issues[0].message);
    try {
      if (list) await m.rename.mutateAsync({ id: list.id, name: v.data.name });
      else await m.create.mutateAsync(v.data.name);
      toast(list ? 'List renamed' : 'List created');
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not save.');
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
      <Input label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={error ?? undefined} autoFocus />
      <FormError>{null}</FormError>
      <div className="row">
        <Button type="submit" loading={m.create.isPending || m.rename.isPending}>
          Save
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function SavedListPage() {
  const { id = '' } = useParams();
  const list = useSavedList(id);
  const m = useListMutations();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);

  if (list.isPending) return <PageSkeleton />;
  if (list.isError)
    return (
      <div className="page">
        {list.error instanceof ApiError && list.error.status === 404 ? (
          <Card>
            <EmptyState title="List not found">
              <Link to="/brand/lists" className="link">
                Back to saved lists
              </Link>
            </EmptyState>
          </Card>
        ) : (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        )}
      </div>
    );
  const l = list.data;
  const remove = async () => {
    if ((await confirm.ask({ title: `Delete “${l.name}”?`, body: 'The creators stay on the platform; only this list is removed.', confirmLabel: 'Delete list' })) === false) return;
    await m.remove.mutateAsync(l.id);
    toast('List deleted');
    navigate('/brand/lists');
  };
  return (
    <div className="page">
      <Link to="/brand/lists" className="link small back-link">
        <LuArrowLeft aria-hidden /> Saved lists
      </Link>
      <PageHeader
        title={l.name}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
              <LuPencil aria-hidden /> Rename
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove()}>
              <LuTrash2 aria-hidden /> Delete
            </Button>
          </>
        }
      />
      {l.creators.length === 0 ? (
        <Card>
          <EmptyState title="Nobody saved here yet">
            <Link to="/search" className="link">
              Find creators
            </Link>{' '}
            and press Save to add them.
          </EmptyState>
        </Card>
      ) : (
        <ul className="creator-grid saved-grid">
          {l.creators.map((c) => (
            <li key={c.username} className="saved-grid__item">
              <CreatorCard creator={c} />
              <div className="saved-grid__actions">
                <InviteToCampaign username={c.username} name={c.displayName} away={c.away} />
                <Button variant="ghost" size="sm" onClick={() => m.drop.mutate({ id: l.id, username: c.username }, { onSuccess: () => void list.refetch() })}>
                  <LuX aria-hidden /> Remove<span className="sr-only"> {c.displayName}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirm.dialog}
      <Drawer open={renaming} onClose={() => setRenaming(false)} title="Rename list">
        {renaming && (
          <ListNameForm
            list={l}
            onDone={() => {
              setRenaming(false);
              void list.refetch();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
