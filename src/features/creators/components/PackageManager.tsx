/**
 * Create, edit, switch on/off and delete packages (FR-12, FR-13).
 * Used by the onboarding wizard and by /creator/packages.
 */
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LuClock, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { PlatformLabel } from '@/components/creator';
import { Badge, Button, Drawer, EmptyState, FormError, Input, TextArea } from '@/components/ui';
import { PLATFORMS } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { DEFAULT_FEES } from '@/api/mock/fees';
import { applyServerErrors } from '@/lib/forms';
import type { CreatorMe, OwnPackage, PackageInput } from '@/types';
import { MAX_ACTIVE_PACKAGES, packageFormSchema, type PackageForm } from '../schemas';
import { useCreatePackage, useDeletePackage, useUpdatePackage } from '../workspaceHooks';

export function PackageManager({ me }: { me: CreatorMe }) {
  const [editing, setEditing] = useState<OwnPackage | 'new' | null>(null);
  const update = useUpdatePackage();
  const del = useDeletePackage();
  const [rowError, setRowError] = useState<string | null>(null);
  const active = me.packages.filter((k) => k.active).length;
  const full = active >= MAX_ACTIVE_PACKAGES;
  const defaultPlatform = me.socials[0]?.platform ?? 'INSTAGRAM';

  const toggle = async (k: OwnPackage) => {
    setRowError(null);
    try {
      await update.mutateAsync({ id: k.id, patch: { active: !k.active } });
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not change the package.');
    }
  };
  const remove = async (k: OwnPackage) => {
    if (!window.confirm(`Delete “${k.title}”? This cannot be undone.`)) return;
    setRowError(null);
    try {
      await del.mutateAsync(k.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not delete the package.');
    }
  };

  return (
    <div className="pkgmgr">
      <div className="pkgmgr__head">
        <span className="small">
          <strong>{active}</strong> of {MAX_ACTIVE_PACKAGES} active packages
        </span>
        <Button size="sm" onClick={() => setEditing('new')}>
          <LuPlus aria-hidden /> Add package
        </Button>
      </div>
      <FormError>{rowError}</FormError>

      {me.packages.length === 0 ? (
        <EmptyState title="No packages yet">Most creators start with two or three, e.g. one Reel, a Story set and a bundle.</EmptyState>
      ) : (
        <ul className="pkglist">
          {me.packages.map((k) => (
            <li key={k.id} className={k.active ? 'pkglist__item' : 'pkglist__item is-off'}>
              <div className="pkglist__main">
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <PlatformLabel platform={k.platform} />
                  {!k.active && <Badge>Off</Badge>}
                </div>
                <div className="pkglist__title">{k.title}</div>
                <div className="list__meta">
                  <LuClock aria-hidden style={{ verticalAlign: 'middle' }} /> {k.deliveryDays}-day delivery · {k.deliverables.length} deliverable{k.deliverables.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="pkglist__price">{formatMoney(k.priceCents, k.currency)}</div>
              <div className="pkglist__actions">
                <label className="switch" title={!k.active && full ? `At most ${MAX_ACTIVE_PACKAGES} active packages` : undefined}>
                  <input type="checkbox" role="switch" checked={k.active} disabled={(!k.active && full) || update.isPending} onChange={() => void toggle(k)} />
                  <span className="switch__track" aria-hidden />
                  <span className="sr-only">
                    {k.title} is {k.active ? 'on' : 'off'}
                  </span>
                </label>
                <Button variant="ghost" size="sm" icon onClick={() => setEditing(k)} aria-label={`Edit ${k.title}`}>
                  <LuPencil aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" icon onClick={() => void remove(k)} aria-label={`Delete ${k.title}`}>
                  <LuTrash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New package' : 'Edit package'}>
        {editing !== null && (
          <PackageEditor
            key={editing === 'new' ? 'new' : editing.id}
            pkg={editing === 'new' ? null : editing}
            defaultPlatform={defaultPlatform}
            activeFull={full}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

function PackageEditor({ pkg, defaultPlatform, activeFull, onDone }: { pkg: OwnPackage | null; defaultPlatform: PackageInput['platform']; activeFull: boolean; onDone: () => void }) {
  const create = useCreatePackage();
  const update = useUpdatePackage();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, control, formState } = useForm<PackageForm, unknown, PackageInput>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: pkg
      ? {
          platform: pkg.platform,
          title: pkg.title,
          description: pkg.description,
          deliverablesText: pkg.deliverables.join('\n'),
          price: (pkg.priceCents / 100).toFixed(pkg.priceCents % 100 ? 2 : 0),
          deliveryDays: String(pkg.deliveryDays),
          active: pkg.active,
        }
      : { platform: defaultPlatform, title: '', description: '', deliverablesText: '', price: '', deliveryDays: '5', active: !activeFull },
  });
  const { errors } = formState;
  const description = useWatch({ control, name: 'description' }) ?? '';

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (pkg) await update.mutateAsync({ id: pkg.id, patch: v });
      else await create.mutateAsync(v);
      onDone();
    } catch (e) {
      const msg = applyServerErrors(e, setError, ['platform', 'title', 'description', 'deliveryDays', 'active']);
      // Map API field names back to the form's.
      const fe = (e as { fieldErrors?: Array<{ field: string; message: string }> }).fieldErrors ?? [];
      for (const x of fe) {
        if (x.field === 'priceCents') setError('price', { message: x.message });
        if (x.field === 'deliverables') setError('deliverablesText', { message: x.message });
      }
      setFormError(fe.length ? null : msg);
    }
  });

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      <FormError>{formError}</FormError>
      <div className="field">
        <label className="field__label" htmlFor="pkg-platform">
          Platform
        </label>
        <select id="pkg-platform" className="field__input" {...register('platform')}>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <Input label="Title" placeholder="e.g. Instagram Reel" error={errors.title?.message} {...register('title')} />
      <TextArea
        label="What the brand gets"
        placeholder="Describe the content, style and where it is posted."
        error={errors.description?.message}
        counter={{ value: description.length, max: 1000 }}
        {...register('description')}
      />
      <TextArea
        label="Deliverables"
        hint="One per line, e.g. “1 Reel (30–60 s)”."
        rows={3}
        error={errors.deliverablesText?.message}
        {...register('deliverablesText')}
      />
      <div className="form-row">
        <Input label="Price (USD)" inputMode="decimal" placeholder="150" hint="At least $10." error={errors.price?.message} {...register('price')} />
        <Input label="Delivery (days)" inputMode="numeric" hint="1 to 60 days." error={errors.deliveryDays?.message} {...register('deliveryDays')} />
      </div>
      <label className="check small">
        <input type="checkbox" {...register('active')} disabled={activeFull && !pkg?.active} />
        <span>
          Show this package on my profile
          {activeFull && !pkg?.active && <span className="muted"> (you already have {MAX_ACTIVE_PACKAGES} active)</span>}
        </span>
      </label>
      <p className="small muted">
        Brands pay a {DEFAULT_FEES.brandFeeBps / 100}% service fee on top; you receive the price minus our {DEFAULT_FEES.creatorFeeBps / 100}% fee.
      </p>
      <div className="row">
        <Button type="submit" loading={create.isPending || update.isPending}>
          {pkg ? 'Save changes' : 'Add package'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
