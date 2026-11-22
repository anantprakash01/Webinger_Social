/**
 * Webinger base components, ported from webinger-portal src/components/ui/index.jsx to TypeScript.
 * Same class names and markup, so the look stays identical (CLAUDE.md §9).
 */
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useDocumentTitle } from '@/lib/documentTitle';
import { LuChevronLeft, LuChevronRight, LuCircleAlert, LuInbox, LuSearch, LuX } from 'react-icons/lu';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'google';
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: boolean;
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', block, icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', icon && 'btn--icon', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {flush ? children : <div className="card__body">{children}</div>}
    </section>
  );
}

/* ---------- Badge ---------- */
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('badge', `badge--${tone}`)}>{children}</span>;
}

/* ---------- Input ---------- */
type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; hint?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, id, className, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={cx('field__input', className)}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint && !error && (
        <span id={hintId} className="small muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errId} className="field__error">
          <LuCircleAlert aria-hidden /> {error}
        </span>
      )}
    </div>
  );
});

/* ---------- TextArea (same field styling as Input) ---------- */
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; error?: string; hint?: ReactNode; counter?: { value: number; max: number } };

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, error, hint, counter, id, className, rows = 4, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errId : null, hint || counter ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cx('field__input field__input--area', className)}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {(hint || counter) && !error && (
        <span id={hintId} className="field__hint">
          <span>{hint}</span>
          {counter && (
            <span className={cx(counter.value > counter.max && 'field__count--over')}>
              {counter.value}/{counter.max}
            </span>
          )}
        </span>
      )}
      {error && (
        <span id={errId} className="field__error">
          <LuCircleAlert aria-hidden /> {error}
        </span>
      )}
    </div>
  );
});

/* ---------- Chip checkboxes (multi-select with an optional maximum) ---------- */
export function ChipGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  max,
  error,
  hint,
}: {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T[];
  onChange: (v: T[]) => void;
  max?: number;
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const full = max !== undefined && value.length >= max;
  return (
    <fieldset className="chipgroup" aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} aria-invalid={error ? true : undefined}>
      <legend className="field__label">
        {legend}
        {max !== undefined && (
          <span className="muted small">
            {' '}
            ({value.length}/{max})
          </span>
        )}
      </legend>
      <div className="chipgroup__list">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <label key={o.value} className={cx('chipgroup__chip', on && 'is-on', !on && full && 'is-disabled')}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && full}
                onChange={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {hint && !error && (
        <span id={`${id}-hint`} className="small muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="field__error">
          <LuCircleAlert aria-hidden /> {error}
        </span>
      )}
    </fieldset>
  );
}

/* ---------- Progress ---------- */
export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress__bar" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Avatar ---------- */
/** Initials on navy, or the picture when `src` is set (account photo / company logo). */
export function Avatar({ name, size = 36, src }: { name: string; size?: number; src?: string | null }) {
  if (src) return <img src={src} alt="" className="avatar avatar--img" style={{ width: size, height: size }} />;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="card stat">
      <div className="stat__label">{label}</div>
      <div className={cx('stat__value', accent && 'stat__value--accent')}>{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  // The tab title follows the page title (WCAG 2.4.2).
  useDocumentTitle(typeof title === 'string' ? title : null);
  return (
    <div className="page__head">
      <div>
        {eyebrow && <div className="page__eyebrow">{eyebrow}</div>}
        <h1 className="page__title">{title}</h1>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/* ---------- States ---------- */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <LuInbox size={28} aria-hidden />
      <div className="state__title">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <LuCircleAlert size={28} aria-hidden />
      <div className="state__title">Something went wrong</div>
      {message && <div className="small">{message}</div>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 40, width: 'min(280px, 80%)' }} />
      <div className="grid grid--stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div className="grid grid--2">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    </div>
  );
}

/* ---------- Select (compact filter) ---------- */
type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  hideLabel?: boolean;
};

export function Select({ label, value, onChange, options, allLabel, hideLabel, className, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={cx('select', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'select__label'}>
        {label}
      </label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} {...rest}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- Search box ---------- */
export function SearchInput({ label = 'Search', value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <LuSearch aria-hidden className="search__icon" />
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }> }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cx('segmented__btn', value === o.value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, totalItems, size, onPage }: { page: number; totalPages: number; totalItems: number; size: number; onPage: (p: number) => void }) {
  if (totalItems === 0) return null;
  const from = page * size + 1;
  const to = Math.min(totalItems, from + size - 1);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="small muted">
        {from}–{to} of {totalItems}
      </span>
      <span className="spacer" />
      <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <LuChevronLeft aria-hidden /> <span className="pager__text">Previous</span>
      </Button>
      <span className="small pager__page">
        Page {page + 1} of {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
        <span className="pager__text">Next</span> <LuChevronRight aria-hidden />
      </Button>
    </nav>
  );
}

/* ---------- Drawer (side panel on desktop, full sheet on phones) ---------- */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}>
        <header className="drawer__head">
          <h2 id={titleId} className="drawer__title">
            {title}
          </h2>
          <Button variant="ghost" icon onClick={onClose} aria-label="Close">
            <LuX size={20} />
          </Button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

/* ---------- Form-level error (problem+json detail) ---------- */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="alert alert--error" role="alert">
      <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{children}</span>
    </div>
  );
}
