/** Order hooks (TanStack Query). Money-moving actions carry an Idempotency-Key that survives retries. */
import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import type { DeliverRequest, OrderBrief, OrderCreateRequest, OrderDetail, ReviewRequest } from '@/types';

export const orderKeys = {
  all: ['orders'] as const,
  list: (status: string, page: number) => ['orders', 'list', status, page] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  quote: (q: object) => ['orders', 'quote', q] as const,
};

export const useOrders = (status: string, page: number) =>
  useQuery({ queryKey: orderKeys.list(status, page), queryFn: () => api.orders.list({ status: status || undefined, page, size: 20 }), placeholderData: keepPreviousData });

export const useOrder = (id: string) => useQuery({ queryKey: orderKeys.detail(id), queryFn: () => api.orders.get(id) });

export const useOrderQuote = (q: { packageId?: string; creatorUsername?: string; priceCents?: number }, enabled = true) =>
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
  | { type: 'dispute'; note: string }
  | { type: 'deliver'; body: DeliverRequest };

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
          return api.orders.dispute(id, a.note, k);
        case 'deliver':
          return api.orders.deliver(id, a.body, k);
      }
    },
    onSuccess: (detail) => {
      key.done();
      refresh(detail);
    },
    // A 409 means the order moved on (e.g. auto-approved meanwhile): show the fresh state.
    onError: () => refresh(),
  });
}

export function useUpdateBrief(id: string) {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (brief: OrderBrief) => api.orders.updateBrief(id, brief), onSuccess: (d) => refresh(d) });
}

export function useReviewOrder(id: string) {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (body: ReviewRequest) => api.orders.review(id, body), onSuccess: () => refresh() });
}

export function useReplyToReview() {
  const refresh = useRefreshOrders();
  return useMutation({ mutationFn: (v: { reviewId: string; reply: string }) => api.orders.reply(v.reviewId, v.reply), onSuccess: () => refresh() });
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
