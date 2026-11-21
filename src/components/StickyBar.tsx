/**
 * Phone-only action bar fixed above the bottom nav (UX pass, item 4). It keeps the page's main
 * action within thumb reach on long pages. Pass `watch` to show it only while that element (usually
 * the page's own action buttons) is scrolled out of view, so the same buttons are never shown twice.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';

const PHONE = '(max-width: 900px)';

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(PHONE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE).matches : false),
    () => false,
  );
}

/** True while the element is outside the viewport (false where IntersectionObserver is missing). */
export function useOutOfView(ref: RefObject<HTMLElement | null> | undefined, enabled: boolean): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const el = ref?.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setOut(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled]);
  return enabled && out;
}

export function StickyBar({ label, children, watch, inShell = true }: { label: string; children: ReactNode; watch?: RefObject<HTMLElement | null>; inShell?: boolean }) {
  const phone = useIsPhone();
  const hidden = useOutOfView(watch, phone && !!watch);
  if (!phone || (watch && !hidden)) return null;
  return (
    <div className={`sticky-bar${inShell ? '' : ' sticky-bar--public'}`} role="region" aria-label={label}>
      {children}
    </div>
  );
}
