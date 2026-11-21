/** Status badges, Webinger style: one place maps each status to a tone and a human label. */
import type { VettingStatus } from '@/types';
import type { OrderStatus } from '@/api/mock/orderMachine';
import { formatWhen } from '@/lib/dates';
import { Badge, type Tone } from './ui';

const VETTING: Record<VettingStatus, [Tone, string]> = {
  DRAFT: ['neutral', 'Draft'],
  PENDING_REVIEW: ['info', 'In review'],
  APPROVED: ['ok', 'Approved'],
  REJECTED: ['danger', 'Changes needed'],
};
export const VettingBadge = ({ status }: { status: VettingStatus }) => <Badge tone={VETTING[status][0]}>{VETTING[status][1]}</Badge>;

const ORDER: Record<OrderStatus, [Tone, string]> = {
  PENDING_ACCEPTANCE: ['warn', 'Awaiting acceptance'],
  IN_PROGRESS: ['info', 'In progress'],
  DELIVERED: ['warn', 'Delivered'],
  COMPLETED: ['ok', 'Completed'],
  DISPUTED: ['danger', 'Disputed'],
  REFUNDED: ['neutral', 'Refunded'],
  CLOSED: ['neutral', 'Closed'],
};
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER[status][0]}>{ORDER[status][1]}</Badge>;
export const orderStatusLabel = (s: OrderStatus) => ORDER[s][1];

/** Past moments: relative under a week, then an absolute date (see lib/dates.ts). */
export const timeAgo = (iso: string) => formatWhen(iso);
