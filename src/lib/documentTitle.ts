/**
 * Browser tab title per page (WCAG 2.4.2 "Page titled"): "Orders · Webinger Collab".
 * PageHeader sets it from its title; pages without a PageHeader call the hook themselves.
 */
import { useEffect } from 'react';

const PRODUCT = 'Webinger Collab';
export const DEFAULT_TITLE = `${PRODUCT} — Creator Marketplace`;

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return undefined;
    const prev = document.title;
    document.title = `${title} · ${PRODUCT}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
