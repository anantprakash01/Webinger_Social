import { Link } from 'react-router-dom';
import { LuMail, LuRefreshCw } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { Button } from '@/components/ui';
import { useDemoOutbox } from '../hooks';

/**
 * Prototype only. There is no real inbox in the demo, so this shows the latest email the system
 * would have sent to `to` and lets the reviewer open its link.
 */
export function DemoInbox({ to, emptyText }: { to: string | undefined; emptyText?: string }) {
  const { data, isFetching, refetch } = useDemoOutbox(to);
  if (!isMock || !to) return null;
  const mail = data?.[0];
  return (
    <div className="demo-email" role="note" aria-live="polite">
      <div className="row small" style={{ fontWeight: 700 }}>
        <LuMail aria-hidden /> Demo inbox for {to}
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={() => void refetch()} aria-label="Check the demo inbox again" disabled={isFetching}>
          <LuRefreshCw aria-hidden />
        </Button>
      </div>
      {mail ? (
        <>
          <div className="small">{mail.subject}</div>
          <div className="list__meta">{mail.body}</div>
          {mail.link && (
            <Link to={mail.link} className="small link">
              Open the link from this email
            </Link>
          )}
        </>
      ) : (
        <div className="list__meta">{emptyText ?? 'No email yet.'}</div>
      )}
    </div>
  );
}
