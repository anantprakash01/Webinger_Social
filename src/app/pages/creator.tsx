/** Creator workspace. Week 1: home with vetting state; the rest are placeholders for their weeks. */
import { Link, useParams } from 'react-router-dom';
import { LuArrowRight, LuInfo } from 'react-icons/lu';
import { VettingBadge } from '@/components/status';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { useAuth } from '../AuthContext';
import { Placeholder } from './Placeholder';

export function CreatorDashboard() {
  const { user } = useAuth();
  if (!user) return null;
  const vetting = user.creator?.vettingStatus ?? 'DRAFT';
  return (
    <div className="page">
      <PageHeader eyebrow="Creator workspace" title={`Hi, ${user.name.split(' ')[0]}`} actions={<VettingBadge status={vetting} />} />
      {vetting !== 'APPROVED' && (
        <div className="note">
          <LuInfo aria-hidden />
          <div>
            <strong>Your profile is not live yet.</strong> Brands can find you once our team approves it.{' '}
            <Link to="/creator/onboarding" className="link">
              Finish your profile <LuArrowRight aria-hidden style={{ verticalAlign: 'middle' }} />
            </Link>
          </div>
        </div>
      )}
      <div className="grid grid--stats">
        <Stat label="Earnings" value="—" hint="Week 3" accent />
        <Stat label="Orders to accept" value="—" hint="Week 4" />
        <Stat label="In progress" value="—" hint="Week 4" />
        <Stat label="Profile views" value="—" hint="Week 3" />
      </div>
      <Card title="Account">
        <ul className="list">
          <li className="list__item">
            <div className="list__main">
              <div className="list__title">Email</div>
              <div className="list__meta">{user.email}</div>
            </div>
            {user.emailVerified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}
          </li>
          <li className="list__item">
            <div className="list__main">
              <div className="list__title">Public profile</div>
              <div className="list__meta">{user.creator?.username ? `/u/${user.creator.username}` : 'Choose a username during setup'}</div>
            </div>
            {user.creator?.username && vetting === 'APPROVED' && (
              <Link to={`/u/${user.creator.username}`} className="btn btn--secondary btn--sm">
                View
              </Link>
            )}
          </li>
        </ul>
      </Card>
    </div>
  );
}

export function CreatorOnboarding() {
  const { user } = useAuth();
  return (
    <Placeholder eyebrow="Profile setup" title="Set up your creator profile" week={3} frs={['FR-10', 'FR-11', 'FR-12', 'FR-14', 'FR-62', 'FR-16']}>
      {user?.creator && (
        <div className="row">
          <span className="small muted">Status:</span> <VettingBadge status={user.creator.vettingStatus} />
          <span className="spacer" />
          <Link to="/creator/dashboard" className="btn btn--ghost btn--sm">
            Go to dashboard
          </Link>
        </div>
      )}
    </Placeholder>
  );
}

export const CreatorOrders = () => <Placeholder title="Orders" week={4} frs={['FR-32', 'FR-34']} />;
export function CreatorOrderDetail() {
  const { id } = useParams();
  return <Placeholder eyebrow="Order" title={id ?? ''} week={4} frs={['FR-32', 'FR-34']} />;
}
export const CreatorCampaigns = () => <Placeholder title="Campaigns" week={5} frs={['FR-41']} />;
export const CreatorPackages = () => <Placeholder title="Packages" week={3} frs={['FR-12', 'FR-13']} />;
export const CreatorPayouts = () => <Placeholder title="Payouts" week={6} frs={['FR-62', 'FR-63', 'FR-65']} />;
