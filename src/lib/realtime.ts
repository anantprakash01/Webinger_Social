/**
 * Real-time updates (FR-50): one `subscribe(topic, handler)` interface for the whole app.
 *
 * http mode: STOMP over WebSocket to `/ws` (Spring's simple broker / Redis relay), topics
 *            /user/queue/messages and /user/queue/notifications, Bearer token in the CONNECT frame.
 * mock mode: polls GET /dev/realtime/poll every few seconds and replays the same topics, so screens
 *            are written once against the STOMP shape (section 9.1: "polling mock in Phase 0").
 */
import { Client } from '@stomp/stompjs';
import { accessToken, api, isMock } from '@/api/client';

export const TOPICS = { messages: '/user/queue/messages', notifications: '/user/queue/notifications' } as const;
type Handler = (payload: unknown) => void;

export interface Realtime {
  subscribe(topic: string, handler: Handler): () => void;
  stop(): void;
}

const POLL_MS = Number(import.meta.env.VITE_REALTIME_POLL_MS ?? 3000);

export function startRealtime(): Realtime {
  const handlers = new Map<string, Set<Handler>>();
  const dispatch = (topic: string, payload: unknown) => handlers.get(topic)?.forEach((h) => h(payload));
  const add = (topic: string, h: Handler) => {
    if (!handlers.has(topic)) handlers.set(topic, new Set());
    handlers.get(topic)!.add(h);
    return () => void handlers.get(topic)?.delete(h);
  };

  if (isMock) {
    let since: string | undefined;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const res = await api.dev.pollRealtime(since);
        if (stopped) return;
        // The first poll only fixes the starting point; nothing before "now" is replayed.
        if (since) for (const e of res.events) dispatch(e.topic, e.payload);
        since = res.serverTime;
      } catch {
        /* signed out or offline: try again on the next tick */
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return {
      subscribe: add,
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  // http mode: STOMP. Subscriptions are (re)made on every (re)connect.
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/api\/v1\/?$/, '');
  const url = new URL(`${base}/ws`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const client = new Client({
    brokerURL: url.toString(),
    reconnectDelay: 5000,
    beforeConnect: () => {
      client.connectHeaders = { Authorization: `Bearer ${accessToken() ?? ''}` };
    },
    onConnect: () => {
      for (const topic of Object.values(TOPICS)) client.subscribe(topic, (frame) => dispatch(topic, JSON.parse(frame.body)));
    },
  });
  client.activate();
  return { subscribe: add, stop: () => void client.deactivate() };
}
