import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuHammer } from 'react-icons/lu';
import { Badge, Card, PageHeader } from '@/components/ui';

/** Stand-in for a screen built in a later prototype week. Lists the requirements it will cover. */
export function Placeholder({ title, eyebrow, week, frs, children }: { title: string; eyebrow?: string; week: number; frs?: string[]; children?: ReactNode }) {
  return (
    <div className="page">
      <PageHeader eyebrow={eyebrow} title={title} />
      {children}
      <Card>
        <div className="state">
          <LuHammer size={28} aria-hidden />
          <div className="state__title">Arrives in Week {week} of the prototype</div>
          {frs && frs.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              {frs.map((f) => (
                <Badge key={f}>{f}</Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <Card>
        <div className="state">
          <div className="state__title">Page not found</div>
          <div className="small">The link may be old, or the page has moved.</div>
          <Link to="/" className="btn btn--secondary btn--sm">
            Go to the home page
          </Link>
        </div>
      </Card>
    </div>
  );
}
