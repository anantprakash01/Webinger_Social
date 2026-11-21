import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/app/AuthContext';

export const creatorKeys = {
  profile: (username: string) => ['creators', 'profile', username.toLowerCase()] as const,
};

/** Public creator profile (FR-15). */
export const useCreatorProfile = (username: string) =>
  useQuery({
    queryKey: creatorKeys.profile(username),
    queryFn: () => api.creators.profile(username),
  });

/**
 * What a visitor can do with a package or a custom offer on a profile.
 * Guests are sent to log in first and come back to the checkout (FR-15: "buying asks to log in as a brand").
 */
export function usePurchaseActions(username: string, availability?: { away: boolean; until?: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const away = !!availability?.away;
  const canBuy = (!user || user.role === 'BRAND') && !away;
  const reason = away
    ? 'This creator is away and not taking new orders.'
    : user?.role === 'CREATOR'
      ? 'Only brand accounts can buy packages.'
      : user?.role === 'ADMIN'
        ? 'Admins cannot buy packages.'
        : null;

  const buy = (packageId: string) => {
    const checkout = `/checkout/${packageId}`;
    if (!user) navigate('/login', { state: { from: checkout, notice: 'Log in with a brand account to buy this package.' } });
    else if (user.role === 'BRAND') navigate(checkout);
  };

  /** FR-31: custom offer. Guests log in first and come straight back to the offer form. */
  const startOffer = () => {
    const offer = `/checkout/offer/${username}`;
    if (!user) navigate('/login', { state: { from: offer, notice: 'Log in with a brand account to send a custom offer.' } });
    else if (user.role === 'BRAND') navigate(offer);
  };

  return { canBuy, reason, buy, startOffer, signedIn: !!user };
}
