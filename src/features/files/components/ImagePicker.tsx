/**
 * Pick an image: upload one (presign → upload), or — in the mock prototype — choose one of the
 * invented demo images so reviewers don't need files at hand.
 */
import { useId, useRef, useState } from 'react';
import { LuImagePlus, LuTrash2 } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { Button, Drawer, cx } from '@/components/ui';
import type { PresignRequest } from '@/types';
import { useUpload } from '../hooks';
import { IMAGE_TYPES } from '../schemas';

const pad = (n: number) => String(n).padStart(2, '0');
const DEMO_IMAGES: Record<PresignRequest['purpose'], string[]> = {
  AVATAR: Array.from({ length: 24 }, (_, i) => `/demo/photo-${pad(i + 1)}.svg`),
  BRAND_LOGO: Array.from({ length: 24 }, (_, i) => `/demo/photo-${pad(i + 1)}.svg`),
  COVER: Array.from({ length: 12 }, (_, i) => `/demo/cover-${pad(i + 1)}.svg`),
  PORTFOLIO: Array.from({ length: 36 }, (_, i) => `/demo/work-${pad(i + 1)}.svg`),
  BRIEF_REFERENCE: Array.from({ length: 36 }, (_, i) => `/demo/work-${pad(i + 1)}.svg`),
  DELIVERABLE: Array.from({ length: 36 }, (_, i) => `/demo/work-${pad(i + 1)}.svg`),
  MESSAGE_ATTACHMENT: Array.from({ length: 36 }, (_, i) => `/demo/work-${pad(i + 1)}.svg`),
};

interface Props {
  label: string;
  purpose: PresignRequest['purpose'];
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: 'circle' | 'wide' | 'square';
  hint?: string;
  /** "Add" mode for lists (e.g. portfolio): no preview or remove, just the buttons. */
  addOnly?: boolean;
  disabled?: boolean;
}

export function ImagePicker({ label, purpose, value, onChange, shape = 'square', hint, addOnly, disabled }: Props) {
  const upload = useUpload(purpose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const id = useId();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    upload.reset();
    try {
      onChange(await upload.mutateAsync(file));
    } catch {
      /* shown below from upload.error */
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={cx('imgpick', `imgpick--${shape}`, addOnly && 'imgpick--add')}>
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="imgpick__row">
        {!addOnly && (
          <div className="imgpick__preview" aria-hidden>
            {value ? <img src={value} alt="" /> : <LuImagePlus size={24} />}
          </div>
        )}
        <div className="imgpick__actions">
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            className="sr-only"
            aria-labelledby={`${id}-label`}
            disabled={disabled || upload.isPending}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending} disabled={disabled}>
            {value && !addOnly ? 'Replace' : 'Upload image'}
          </Button>
          {isMock && (
            <Button variant="ghost" size="sm" onClick={() => setDemoOpen(true)} disabled={disabled}>
              Use a demo image
            </Button>
          )}
          {value && !addOnly && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Remove ${label.toLowerCase()}`} disabled={disabled}>
              <LuTrash2 aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {upload.error ? (
        <span className="field__error" role="alert">
          {upload.error.message}
        </span>
      ) : (
        hint && <span className="small muted">{hint}</span>
      )}

      <Drawer open={demoOpen} onClose={() => setDemoOpen(false)} title="Choose a demo image">
        <p className="small muted" style={{ marginBottom: 12 }}>
          Prototype only: invented artwork, so you can try the flow without your own files.
        </p>
        <ul className={cx('demo-images', `demo-images--${shape}`)}>
          {DEMO_IMAGES[purpose].map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => {
                  onChange(src);
                  setDemoOpen(false);
                }}
                aria-label={`Demo image ${i + 1}`}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
}
