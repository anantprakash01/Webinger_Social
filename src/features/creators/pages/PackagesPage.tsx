/** /creator/packages — manage packages (FR-12, FR-13). */
import { Link } from 'react-router-dom';
import { Card, ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { PackageManager } from '../components/PackageManager';
import { useMyCreator } from '../workspaceHooks';

export function PackagesPage() {
  const { data: me, isPending, isError, error, refetch } = useMyCreator();
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Creator workspace"
        title="Packages"
        actions={
          me.username && me.vettingStatus === 'APPROVED' ? (
            <Link to={`/u/${me.username}`} className="btn btn--secondary btn--sm">
              View on my profile
            </Link>
          ) : undefined
        }
      />
      <Card>
        <PackageManager me={me} />
      </Card>
    </div>
  );
}
