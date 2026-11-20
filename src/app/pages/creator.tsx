/** Creator workspace screens still to come. Dashboard, onboarding and packages live in features/creators. */
import { useParams } from 'react-router-dom';
import { Placeholder } from './Placeholder';

export const CreatorOrders = () => <Placeholder title="Orders" week={4} frs={['FR-32', 'FR-34']} />;
export function CreatorOrderDetail() {
  const { id } = useParams();
  return <Placeholder eyebrow="Order" title={id ?? ''} week={4} frs={['FR-32', 'FR-34']} />;
}
export const CreatorCampaigns = () => <Placeholder title="Campaigns" week={5} frs={['FR-41']} />;
export const CreatorPayouts = () => <Placeholder title="Payouts" week={6} frs={['FR-63', 'FR-65']} />;
