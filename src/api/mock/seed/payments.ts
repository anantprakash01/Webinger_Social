/**
 * Payments seed (v2.0, India / Razorpay): payout accounts for every creator who can be paid, a saved
 * card and UPI ID for the demo brand.
 * All numbers and names are invented; IFSC codes use made-up branch suffixes.
 */
import type { CreatorProfileRow, PayoutAccountRow, SavedMethodRow, UserRow } from '../db';

const DAY = 86_400_000;
const BANKS = [
  { prefix: 'HDFC', name: 'HDFC Bank' },
  { prefix: 'ICIC', name: 'ICICI Bank' },
  { prefix: 'SBIN', name: 'State Bank of India' },
  { prefix: 'UTIB', name: 'Axis Bank' },
  { prefix: 'KKBK', name: 'Kotak Mahindra Bank' },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function seedPayments(
  now: Date,
  ids: { brandId: string; leoId: string },
  creators: { creatorProfiles: CreatorProfileRow[] },
  users: UserRow[],
): { payoutAccounts: PayoutAccountRow[]; savedMethods: SavedMethodRow[] } {
  const payoutAccounts = creators.creatorProfiles
    .filter((p) => p.payoutStatus === 'ENABLED')
    .map((p): PayoutAccountRow => {
      const h = hash(p.userId);
      const bank = BANKS[h % BANKS.length];
      const name = users.find((u) => u.id === p.userId)?.name ?? p.displayName;
      const upi = h % 4 === 0 && p.userId !== ids.leoId;
      return {
        creatorId: p.userId,
        method: upi ? 'UPI' : 'BANK_ACCOUNT',
        holderName: name,
        pan: `ABCPE${String(1000 + (h % 9000))}F`,
        accountNumber: upi ? null : `50100${String(h).padStart(10, '0').slice(-10)}`,
        ifsc: upi ? null : `${bank.prefix}0${String(100_000 + (h % 900_000))}`,
        vpa: upi ? `${(p.username ?? 'creator').replace(/[^a-z0-9.]/g, '')}@okaxis` : null,
        status: 'VERIFIED',
        failureReason: null,
        updatedAt: new Date(now.getTime() - 60 * DAY).toISOString(),
      };
    });

  const savedMethods: SavedMethodRow[] = [
    { id: 'token_mocksaltbayvisa', userId: ids.brandId, type: 'CARD', network: 'Visa', last4: '1111', expiry: '12/29', vpa: null, createdAt: new Date(now.getTime() - 40 * DAY).toISOString() },
    { id: 'token_mocksaltbayupi', userId: ids.brandId, type: 'UPI', network: null, last4: null, expiry: null, vpa: 'saltbay@okhdfcbank', createdAt: new Date(now.getTime() - 30 * DAY).toISOString() },
  ];

  return { payoutAccounts, savedMethods };
}

export const bankNameFor = (ifsc: string | null) => BANKS.find((b) => ifsc?.startsWith(b.prefix))?.name ?? 'Bank';
