/** Wizard step 4 — portfolio images and video links (FR-14). Optional, max 12. */
import { useState, type FormEvent } from 'react';
import { LuPlay, LuTrash2 } from 'react-icons/lu';
import { Button, EmptyState, FormError, Input } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { applyServerErrors } from '@/lib/forms';
import type { CreatorMe } from '@/types';
import { MAX_PORTFOLIO_ITEMS } from '../../schemas';
import { useAddPortfolioItem, useRemovePortfolioItem } from '../../workspaceHooks';
import { StepNav } from './StepNav';

export function PortfolioStep({ me, next, back }: { me: CreatorMe; next?: () => void; back?: () => void }) {
  const add = useAddPortfolioItem();
  const remove = useRemovePortfolioItem();
  const [error, setError] = useState<string | null>(null);
  const full = me.portfolio.length >= MAX_PORTFOLIO_ITEMS;

  const addImage = async (url: string | null) => {
    if (!url) return;
    setError(null);
    try {
      await add.mutateAsync({ type: 'IMAGE', url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the image.');
    }
  };

  return (
    <div className="form-stack">
      <div className="pkgmgr__head">
        <span className="small">
          <strong>{me.portfolio.length}</strong> of {MAX_PORTFOLIO_ITEMS} items
        </span>
      </div>
      <FormError>{error}</FormError>

      {me.portfolio.length === 0 ? (
        <EmptyState title="Nothing here yet">Add a few images of past work or links to videos you're proud of.</EmptyState>
      ) : (
        <ul className="portfolio portfolio--edit">
          {me.portfolio.map((it, i) => (
            <li key={it.id} className={it.type === 'IMAGE' ? 'portfolio__item' : 'portfolio__item portfolio__item--video'}>
              {it.type === 'IMAGE' ? (
                <img src={it.url} alt={it.caption ?? `Portfolio image ${i + 1}`} />
              ) : (
                <a href={it.url} target="_blank" rel="noopener noreferrer">
                  <LuPlay size={24} aria-hidden />
                  <span>{it.caption ?? 'Video link'}</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              <button type="button" className="portfolio__remove" onClick={() => remove.mutate(it.id)} aria-label={`Remove portfolio item ${i + 1}`} disabled={remove.isPending}>
                <LuTrash2 aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="small muted">Your portfolio is full. Remove an item to add another.</p>
      ) : (
        <div className="portfolio-add">
          <ImagePicker label="Add an image" purpose="PORTFOLIO" value={null} onChange={(url) => void addImage(url)} addOnly disabled={add.isPending} />
          <VideoLinkForm />
        </div>
      )}

      <StepNav back={back} next={next} nextLabel={me.portfolio.length ? 'Continue' : 'Skip for now'} />
    </div>
  );
}

function VideoLinkForm() {
  const add = useAddPortfolioItem();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [errors, setErrors] = useState<{ url?: string; caption?: string; form?: string | null }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      await add.mutateAsync({ type: 'VIDEO_LINK', url: url.trim(), caption: caption.trim() || null });
      setUrl('');
      setCaption('');
    } catch (err) {
      const next: { url?: string; caption?: string } = {};
      const form = applyServerErrors(err, (field, v) => (next[field as 'url' | 'caption'] = v.message), ['url', 'caption']);
      setErrors({ ...next, form });
    }
  };

  return (
    <form className="video-link" onSubmit={(e) => void submit(e)} noValidate aria-label="Add a video link">
      <span className="field__label">Or add a video link</span>
      <FormError>{errors.form}</FormError>
      <Input label="Video URL" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} />
      <Input label="Caption (optional)" value={caption} maxLength={140} onChange={(e) => setCaption(e.target.value)} error={errors.caption} />
      <Button type="submit" variant="secondary" size="sm" loading={add.isPending} disabled={!url.trim()}>
        Add link
      </Button>
    </form>
  );
}
