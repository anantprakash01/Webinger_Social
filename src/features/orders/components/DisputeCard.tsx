/**
 * v3.1 dispute card on the order page (brand and creator) and the admin console: the brand's reason,
 * the creator's response (with its 48-hour window), evidence from both sides, and the decision.
 */
import { useRef, useState } from 'react';
import { LuFileText, LuLink, LuPaperclip, LuScale } from 'react-icons/lu';
import { api } from '@/api/client';
import { toast } from '@/components/feedback';
import { Badge, Button, Card, FormError, Input, TextArea } from '@/components/ui';
import { formatWhen } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { ApiError, type DisputeEvidence, type DisputeView, type OrderDetail } from '@/types';
import { useDisputeActions } from '../hooks';
import { DISPUTE_REASONS, MAX_EVIDENCE_PER_SIDE, RESOLUTION_REASONS, disputeEvidenceSchema, disputeResponseSchema } from '../schemas';

export const DISPUTE_REASON_LABEL: Record<string, string> = Object.fromEntries(DISPUTE_REASONS.map((r) => [r.value, r.label]));
export const RESOLUTION_REASON_LABEL: Record<string, string> = Object.fromEntries(RESOLUTION_REASONS.map((r) => [r.value, r.label]));
const OUTCOME: Record<string, string> = { RELEASE: 'Released to the creator', FULL_REFUND: 'Full refund to the brand', PARTIAL_REFUND: 'Partial refund to the brand' };

const errorText = (e: unknown) => (e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Something went wrong. Try again.');

export function DisputeCard({ o, d, role }: { o: OrderDetail; d: DisputeView; role: 'BRAND' | 'CREATOR' | 'ADMIN' }) {
  const canRespond = o.allowedActions.includes('DISPUTE_RESPOND');
  const canAdd = o.allowedActions.includes('ADD_EVIDENCE');
  const windowOpen = new Date(d.respondBy).getTime() > new Date(o.serverTime).getTime();
  return (
    <Card title="Dispute" className="dispute">
      <div className="form-stack">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Badge tone={d.status === 'OPEN' ? 'warn' : 'neutral'}>{d.status === 'OPEN' ? 'Under review' : 'Resolved'}</Badge>
          <Badge>{DISPUTE_REASON_LABEL[d.reasonCode] ?? 'Other'}</Badge>
          <span className="list__meta">Opened {formatWhen(d.openedAt)}</span>
        </div>
        <section className="dispute__side">
          <h3 className="dispute__h">Brand</h3>
          <p className="small">{d.reason}</p>
        </section>
        <section className="dispute__side">
          <h3 className="dispute__h">Creator</h3>
          {d.creatorResponse ? (
            <p className="small">{d.creatorResponse}</p>
          ) : canRespond ? (
            <RespondForm orderId={o.id} respondBy={d.respondBy} />
          ) : (
            <p className="small muted">
              {d.status === 'OPEN' && windowOpen
                ? `No response yet. The creator can respond until ${formatWhen(d.respondBy)}.`
                : 'The creator did not respond.'}
            </p>
          )}
        </section>
        <section className="dispute__side">
          <h3 className="dispute__h">Evidence</h3>
          {d.evidence.length === 0 ? <p className="small muted">None added yet.</p> : <EvidenceList items={d.evidence} />}
          {canAdd && role !== 'ADMIN' && <AddEvidence orderId={o.id} left={MAX_EVIDENCE_PER_SIDE - d.evidence.filter((e) => e.by === role).length} />}
        </section>
        {d.status === 'RESOLVED' && (
          <section className="dispute__side dispute__decision">
            <h3 className="dispute__h">
              <LuScale aria-hidden /> Decision
            </h3>
            <p className="small">
              <strong>{d.resolution ? OUTCOME[d.resolution] : 'Resolved'}</strong>
              {d.refundCents ? ` — ${formatMoney(d.refundCents, o.money.currency)} refunded to the original payment method` : ''}
              {d.resolutionReason ? ` · ${RESOLUTION_REASON_LABEL[d.resolutionReason]}` : ''}
            </p>
            {d.resolutionNote && <p className="small muted">“{d.resolutionNote}”</p>}
          </section>
        )}
      </div>
    </Card>
  );
}

export function EvidenceList({ items }: { items: DisputeEvidence[] }) {
  return (
    <ul className="evidence">
      {items.map((e) => (
        <li key={e.id} className="evidence__item">
          <Badge tone={e.by === 'BRAND' ? 'info' : 'neutral'}>{e.by === 'BRAND' ? 'Brand' : 'Creator'}</Badge>
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="link small evidence__link">
            {e.kind === 'LINK' ? <LuLink aria-hidden /> : <LuFileText aria-hidden />} {e.name || (e.kind === 'LINK' ? e.url : 'File')}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {e.note && <span className="small muted evidence__note">{e.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function RespondForm({ orderId, respondBy }: { orderId: string; respondBy: string }) {
  const m = useDisputeActions(orderId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    const v = disputeResponseSchema.safeParse({ response: text });
    if (!v.success) return setError(v.error.issues[0].message);
    setError(null);
    try {
      await m.respond.mutateAsync(v.data.response);
      toast('Response sent. Our team will decide soon.');
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="form-stack">
      <p className="small">
        Tell our team your side before <strong>{formatWhen(respondBy)}</strong>. You can respond once; add screenshots or links as evidence below.
      </p>
      <TextArea label="Your response" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <FormError>{error}</FormError>
      <div>
        <Button onClick={() => void send()} loading={m.respond.isPending}>
          Send response
        </Button>
      </div>
    </div>
  );
}

function AddEvidence({ orderId, left }: { orderId: string; left: number }) {
  const m = useDisputeActions(orderId);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (input: { kind: 'FILE' | 'LINK'; url: string; name?: string | null }) => {
    const v = disputeEvidenceSchema.safeParse({ ...input, note: note.trim() || null });
    if (!v.success) return setError(v.error.issues[0].message);
    setError(null);
    try {
      await m.addEvidence.mutateAsync(v.data);
      setLink('');
      setNote('');
      toast('Evidence added');
    } catch (e) {
      setError(errorText(e));
    }
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await api.files.upload(file, 'DISPUTE_EVIDENCE');
      await add({ kind: 'FILE', url, name: file.name.slice(0, 200) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="form-stack evidence__add">
      <p className="small muted">
        Add up to {left} more: screenshots, the brief, or links to the post. Both sides and our team can see them.
      </p>
      <Input label="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Brief asked for the product in the first 3 seconds" />
      <div className="evidence__row">
        <Input label="Link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        <Button variant="secondary" onClick={() => void add({ kind: 'LINK', url: link.trim(), name: null })} loading={m.addEvidence.isPending && !uploading} disabled={!link.trim()}>
          Add link
        </Button>
      </div>
      <input ref={fileRef} id={`evidence-${orderId}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      <div>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} loading={uploading}>
          <LuPaperclip aria-hidden /> Upload an image or PDF
        </Button>
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}
