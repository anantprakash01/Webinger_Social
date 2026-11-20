/** Screens shared by every signed-in role. Built in Week 5. */
import { useParams } from 'react-router-dom';
import { Placeholder } from './Placeholder';

export const MessagesPage = () => <Placeholder title="Messages" week={5} frs={['FR-50', 'FR-51']} />;
export function ConversationPage() {
  const { conversationId } = useParams();
  return <Placeholder eyebrow="Conversation" title={conversationId ?? ''} week={5} frs={['FR-50', 'FR-51']} />;
}
export const NotificationsPage = () => <Placeholder title="Notifications" week={5} frs={['FR-52']} />;
