/** Order hooks (TanStack Query). Money-moving actions carry an Idempotency-Key that survives retries. */
import { toast } from '@/components/feedback';
import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import type { DeliverRequest, DisputeEvidenceInput, DisputeReasonCode, OrderBrief, OrderCreateRequest, OrderDetail, PostMetricsInput, ReviewRequest } from '@/types';

export const orderKeys = {
  all: ['orders'] as const,
  list: (status: string, page: number) => ['orders', 'list', status, page] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  quote: (q: object) => ['orders', 'quote', q] as const,
};

export const useOrders = (status: string, page: number) =>
  useQuery({ queryKey: orderKeys.list(status, page), queryFn: () => api.orders.list({ status: status || undefined, page, size: 20 }), placeholderData: keepPreviousData });

export const useOrder = (id: string) => useQuery({ queryKey: orderKeys.detail(id), queryFn: () => api.orders.get(id) });

export const useOrderQuote = (q: { packageId?: string; creatorUsername?: string; priceCents?: number; addonIds?: string }, enabled = true) =>
  useQuery({ queryKey: orderKeys.quote(q), queryFn: () => api.orders.quote(q), enabled, placeholderData: keepPreviousData, retry: false });

/**
 * One key per user action: kept if the request fails (so a retry cannot act twice), replaced after success.
 */
function useIdempotencyKey() {
  const ref = useRef<string | null>(null);
  return {
    get: () => (ref.current ??= newIdempotencyKey()),
    done: () => {
      ref.current = null;
    },
  };
}

/** Refreshes everything that shows order data: lists, details, dashboards, creator stats, profiles. */
function useRefreshOrders() {
  const qc = useQueryClient();
  return (detail?: OrderDetail) => {
    if (detail) qc.setQueryData(orderKeys.detail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: orderKeys.all });
    void qc.invalidateQueries({ queryKey: ['creators'] });
  };
}

export function useCreateOrder() {
  const key = useIdempotencyKey();
  const refresh = useRefreshOrders();
  return useMutation({
    mutationFn: (body: OrderCreateRequest) => api.orders.create(body, key.get()),
    onSuccess: () => {
      key.done();
      refresh();
    },
  });
}

export type OrderActionInput =
  | { type: 'accept' }
  | { type: 'approve' }
  | { type: 'decline'; reason: string | null }
  | { type: 'cancel'; reason: string | null }
  | { type: 'request-revision'; note: string }
  | { type: 'dispute'; note: string; reasonCode?: DisputeReasonCode }
  | { type: 'deliver'; body: DeliverRequest };

const ACTION_DONE: Record<OrderActionInput['type'], string> = {
  accept: 'Order accepted. The payment is captured and held in escrow.',
  decline: 'Order declined. The payment hold is released.',
  cancel: 'Order cancelled. The payment hold is released.',
  deliver: 'Delivered. The brand has 72 hours to review.',
  approve: 'Approved. Payment released to the creator.',
  'request-revision': 'Revision requested.',
  dispute: 'Dispute opened. Our team will review it.',
};

export function useOrderAction(id: string) {
  const key = useIdempotencyKey();
  const refresh = useRefreshOrders();
  return useMutation({
    mutationFn: (a: OrderActionInput) => {
      const k = key.get();
      switch (a.type) {
        case 'accept':
          return api.orders.accept(id, k);
        case 'approve':
          return api.orders.approve(id, k);
        case 'decline':
          return api.orders.decline(id, a.reason, k);
        case 'cancel':
          return api.orders.cancel(id, a.reason, k);
        case 'request-revision':
          return api.orders.requestRevision(id, a.note, k);
        case 'dispute':
          return api.orders.dispute(id, a.note, k, a.reasonCode);
        case 'deliver':
          return api.orders.deliver(id, a.body, k);
      }
    },
    onSuccess: (detail, a) => {
      key.done();
      refresh(detail);
      toast(ACTION_DONE[a.type]);
    },
    // A 409 means the order moved on (e.g. auto-approved meanwhile): show the fresh state.
    onError: () => refresh(),
  });
}

/** v3.1: the creator's response to a dispute and evidence from either side (no money moves). */
export function useDisputeActions(id: string) {
  const refresh = useRefreshOrders();
  return {
    respond: useMutation({ mutationFn: (response: string) => api.orders.respondToDispute(id, response), onSuccess: (d) => refresh(d), onError: () => refresh() }),
    addEvidence: useMutation({ mutationFn: (body: DisputeEvidenceInput) => api.orders.addDisputeEvidence(id, body), onSuccess: (d) => refresh(d), onError: () => refresh() }),
  };
}

export function useUpdateBrief(id: string) {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (brief: OrderBrief) => api.orders.updateBrief(id, brief), onSuccess: (d) => {
    refresh(d);
    toast('Brief updated');
  } });
}

export function useReviewOrder(id: string) {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (body: ReviewRequest) => api.orders.review(id, body), onSuccess: () => {
    refresh();
    toast('Review posted');
  } });
}

export function useReplyToReview() {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (v: { reviewId: string; reply: string }) => api.orders.reply(v.reviewId, v.reply), onSuccess: () => {
    refresh();
    toast('Reply posted');
  } });
}

/** Re-renders every `ms` so countdowns stay current. */
export function useTicker(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------- Mock-only: Simulate time ---------- */

export const useDemoClock = (enabled: boolean) => useQuery({ queryKey: ['dev', 'clock'], queryFn: () => api.dev.clock(), enabled });

export function useSimulateTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: number) => api.dev.simulateTime(hours),
    // Everything time-based may have changed: refetch it all.
    onSuccess: () => qc.invalidateQueries(),
  });
}

/* ---------- Collaboration (phase C): drafts, shipping, more time, post results ---------- */

type CollabInput =
  | { type: 'share-draft'; body: DeliverRequest }
  | { type: 'review-draft'; draftId: string; decision: 'APPROVE' | 'CHANGES'; note?: string | null }
  | { type: 'ship'; courier: string; trackingNumber: string }
  | { type: 'received' }
  | { type: 'request-extension'; extraDays: number; reason: string }
  | { type: 'review-extension'; decision: 'ACCEPT' | 'DECLINE' }
  | { type: 'metrics'; deliveryId: string; body: PostMetricsInput };

const COLLAB_DONE: Record<CollabInput['type'], string> = {
  'share-draft': 'Draft shared with the brand.',
  'review-draft': 'Draft reviewed.',
  ship: 'Shipping details saved.',
  received: 'Marked as received.',
  'request-extension': 'Request sent to the brand.',
  'review-extension': 'Answer sent.',
  metrics: 'Results saved.',
};

export function useCollab(id: string) {
  const refresh = useRefreshOrders();
  return useMutation({
    mutationFn: (a: CollabInput) => {
      switch (a.type) {
        case 'share-draft':
          return api.orders.shareDraft(id, a.body);
        case 'review-draft':
          return api.orders.reviewDraft(id, a.draftId, { decision: a.decision, note: a.note ?? null });
        case 'ship':
          return api.orders.saveShipment(id, { courier: a.courier, trackingNumber: a.trackingNumber });
        case 'received':
          return api.orders.markReceived(id);
        case 'request-extension':
          return api.orders.requestExtension(id, { extraDays: a.extraDays, reason: a.reason });
        case 'review-extension':
          return api.orders.reviewExtension(id, a.decision);
        case 'metrics':
          return api.orders.saveMetrics(id, a.deliveryId, a.body);
      }
    },
    onSuccess: (detail, a) => {
      refresh(detail);
      toast(COLLAB_DONE[a.type]);
    },
    onError: () => refresh(),
  });
}
