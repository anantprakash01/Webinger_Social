/** Brand workspace. Week 1: home with account state; the rest are placeholders for their weeks. */
import { Link, useParams } from 'react-router-dom';
import { LuSearch } from 'react-icons/lu';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { useAuth } from '../AuthContext';
import { Placeholder } from './Placeholder';

export function BrandDashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page">
      <PageHeader
        eyebrow={user.brand?.companyName ?? 'Brand workspace'}
        title={`Hi, ${user.name.split(' ')[0]}`}
        actions={
          <Link to="/search" className="btn btn--primary">
            <LuSearch aria-hidden /> Find creators
          </Link>
        }
      />
      <div className="grid grid--stats">
        <Stat label="Spend" value="—" hint="Week 5" />
        <Stat label="Active orders" value="—" hint="Week 4" />
        <Stat label="Delivered posts" value="—" hint="Week 5" />
        <Stat label="Open campaigns" value="—" hint="Week 5" />
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
              <div className="list__title">Company profile</div>
              <div className="list__meta">{user.brand?.companyName ?? 'Not set up yet (Week 3)'}</div>
            </div>
            <Link to="/brand/profile" className="btn btn--secondary btn--sm">
              Open
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export const BrandCampaigns = () => <Placeholder title="Campaigns" week={5} frs={['FR-40', 'FR-42']} />;
export function BrandCampaignDetail() {
  const { id } = useParams();
  return <Placeholder eyebrow="Campaign" title={id ?? ''} week={5} frs={['FR-40', 'FR-42']} />;
}

