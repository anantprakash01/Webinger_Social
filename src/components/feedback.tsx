/**
 * Feedback primitives (UX pass): toasts that confirm an action, an in-app confirm dialog that
 * replaces window.confirm / window.prompt, and an edge fade for rows of tabs that scroll sideways.
 */
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuCircleAlert, LuCircleCheck, LuX } from 'react-icons/lu';
import { Button, Drawer, FormError, TextArea } from './ui';

/* ---------- Toasts ---------- */
interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}
let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a short confirmation ("Package saved") for 4 seconds. Errors stay until dismissed. */
export function toast(text: string, tone: ToastItem['tone'] = 'ok') {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, text, tone }];
  emit();
  if (tone === 'ok') setTimeout(() => dismiss(id), 4000);
}
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  return createPortal(
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.tone === 'ok' ? <LuCircleCheck aria-hidden /> : <LuCircleAlert aria-hidden />}
          <span>{t.text}</span>
          <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <LuX aria-hidden />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ---------- Confirm dialog ---------- */
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  /** Asks for a reason (replaces window.prompt). `reasonMin` characters are required. */
  reasonLabel?: string;
  reasonDefault?: string;
  reasonMin?: number;
}

/**
 * In-app confirmation. Usage: `const confirm = useConfirm();` then
 * `if (await confirm.ask({...})) …` and render `{confirm.dialog}` once in the component.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const ask = (opts: ConfirmOptions) => new Promise<string | false>((resolve) => setState({ ...opts, resolve }));
  const close = (v: string | false) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = <ConfirmBody state={state} onClose={close} />;
  return { ask, dialog };
}

type ConfirmState = ConfirmOptions & { resolve: (v: string | false) => void };

function ConfirmBody({ state, onClose }: { state: ConfirmState | null; onClose: (v: string | false) => void }) {
  return (
    <Drawer open={!!state} onClose={() => onClose(false)} title={state?.title ?? ''}>
      {state && <ConfirmForm state={state} onClose={onClose} />}
    </Drawer>
  );
}

/** Mounted fresh for every question, so the reason field starts from its default. */
function ConfirmForm({ state, onClose }: { state: ConfirmState; onClose: (v: string | false) => void }) {
  const [reason, setReason] = useState(state.reasonDefault ?? '');
  const [error, setError] = useState<string | null>(null);
  const min = state.reasonMin ?? 0;
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (state.reasonLabel && reason.trim().length < min) {
          setError(`Add at least ${min} characters.`);
          return;
        }
        onClose(state.reasonLabel ? reason.trim() : 'yes');
      }}
    >
      {state.body && <div className="small">{state.body}</div>}
      {state.reasonLabel && <TextArea label={state.reasonLabel} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint={min ? `At least ${min} characters.` : undefined} />}
      <FormError>{error}</FormError>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button type="submit">{state.confirmLabel}</Button>
        <Button variant="ghost" onClick={() => onClose(false)}>
          Back
        </Button>
      </div>
    </form>
  );
}

/* ---------- Edge fade for sideways-scrolling rows ---------- */
/** Callback ref that adds `has-more-left` / `has-more-right` classes while the row can scroll that way. */
export function useEdgeFade<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () => {
      el.classList.toggle('has-more-left', el.scrollLeft > 2);
      el.classList.toggle('has-more-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    cleanup.current = () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);
}

/** A row of filter tabs that fades at the edge while more tabs are scrolled out of view. */
export function TabRow({ label, children }: { label: string; children: ReactNode }) {
  const fade = useEdgeFade<HTMLDivElement>();
  return (
    <div className="platform-tabs" role="group" aria-label={label} ref={fade}>
      {children}
    </div>
  );
}
