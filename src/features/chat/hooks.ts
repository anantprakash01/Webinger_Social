import type { MessageAttachment } from '@/types';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import { startRealtime, TOPICS } from '@/lib/realtime';

export const chatKeys = {
  all: ['chat'] as const,
  conversations: ['chat', 'conversations'] as const,
  messages: (id: string) => ['chat', 'messages', id] as const,
};
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean, page: number) => ['notifications', 'list', unreadOnly, page] as const,
  count: ['notifications', 'count'] as const,
};

export const useConversations = () => useQuery({ queryKey: chatKeys.conversations, queryFn: () => api.chat.conversations() });

export const useMessages = (id: string) => useQuery({ queryKey: chatKeys.messages(id), queryFn: () => api.chat.messages(id), enabled: !!id });

export function useSendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; attachment?: MessageAttachment | null }) => api.chat.send(id, v.body, v.attachment ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

/* ---------- Pre-booking inquiries (v3.0) ---------- */

export function useInquiryAllowance() {
  const { user } = useAuth();
  return useQuery({ queryKey: [...chatKeys.all, 'allowance'], queryFn: () => api.chat.inquiryAllowance(), enabled: user?.role === 'BRAND' });
}

export function useStartInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { creatorUsername: string; body: string }) => api.chat.startInquiry(v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.all });
      void qc.invalidateQueries({ queryKey: ['creators'] });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.chat.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
  });
}

/* ---------- Notifications (FR-52) ---------- */

export const useNotifications = (unreadOnly: boolean, page: number) =>
  useQuery({ queryKey: notificationKeys.list(unreadOnly, page), queryFn: () => api.notifications.list({ unreadOnly, page, size: 20 }) });

/** Unread counts for the nav badges and the bell. */
export function useUnreadCounts() {
  const { user } = useAuth();
  const notes = useQuery({ queryKey: notificationKeys.count, queryFn: () => api.notifications.list({ size: 1 }), enabled: !!user });
  const convs = useConversations();
  return { notifications: notes.data?.unreadCount ?? 0, messages: user ? (convs.data?.unreadTotal ?? 0) : 0 };
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ids?: string[]; all?: boolean }) => api.notifications.markRead(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/**
 * Keeps chat, notifications and order screens fresh from the real-time feed (STOMP, or the mock's
 * poller). A new notification usually means an order changed state, so order data is refreshed too.
 */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    const rt = startRealtime();
    const offMessages = rt.subscribe(TOPICS.messages, () => void qc.invalidateQueries({ queryKey: chatKeys.all }));
    const offNotes = rt.subscribe(TOPICS.notifications, () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['brands'] });
      void qc.invalidateQueries({ queryKey: ['creators', 'me'] });
    });
    return () => {
      offMessages();
      offNotes();
      rt.stop();
    };
  }, [enabled, qc]);
}
