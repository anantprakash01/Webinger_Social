/** Brief inputs (FR-33): requirements, links, reference images, shipping. Used at checkout and when editing. */
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { LuTrash2 } from 'react-icons/lu';
import { Input, TextArea } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { LOCATIONS } from '@/lib/catalog';
import type { CheckoutFormValues } from '../schemas';

export function BriefFields({ form }: { form: UseFormReturn<CheckoutFormValues, unknown, unknown> }) {
  const { register, control, formState } = form;
  const errors = formState.errors;
  const needsShipping = useWatch({ control, name: 'needsShipping' });
  const requirements = useWatch({ control, name: 'requirements' }) ?? '';

  return (
    <div className="form-stack">
      <TextArea
        label="What do you need?"
        rows={6}
        placeholder="Key messages, must-show features, tone, dos and don'ts, posting date…"
        error={errors.requirements?.message}
        counter={{ value: requirements.length, max: 4000 }}
        {...register('requirements')}
      />
      <TextArea
        label="Links (optional)"
        rows={2}
        placeholder="https://yourbrand.com/product"
        hint="One per line, up to 5 — product pages, brand guidelines, examples you like."
        error={errors.linksText?.message}
        {...register('linksText')}
      />
      <Controller
        control={control}
        name="referenceFiles"
        render={({ field }) => (
          <div className="form-stack">
            {field.value.length > 0 && (
              <ul className="ref-files">
                {field.value.map((url, i) => (
                  <li key={url + i}>
                    <img src={url} alt={`Reference image ${i + 1}`} />
                    <button type="button" onClick={() => field.onChange(field.value.filter((_, j) => j !== i))} aria-label={`Remove reference image ${i + 1}`}>
                      <LuTrash2 aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {field.value.length < 5 && (
              <ImagePicker
                label="Reference images (optional)"
                purpose="BRIEF_REFERENCE"
                value={null}
                addOnly
                onChange={(url) => url && field.onChange([...field.value, url])}
                hint="Mood boards, product shots, examples — up to 5."
              />
            )}
            {errors.referenceFiles && <span className="field__error">{errors.referenceFiles.message}</span>}
          </div>
        )}
      />
      <label className="check small">
        <input type="checkbox" {...register('needsShipping')} />
        <span>The creator needs the product — we will ship it to them</span>
      </label>
      {needsShipping && (
        <fieldset className="form-optional">
          <legend className="field__label">Ship from (return address)</legend>
          <p className="small muted">The creator shares their delivery address in chat after accepting.</p>
          <div className="form-row">
            <Input label="Contact name" error={errors.shipName?.message} {...register('shipName')} />
            <Input label="Street address" error={errors.shipLine1?.message} {...register('shipLine1')} />
          </div>
          <Input label="Address line 2 (optional)" {...register('shipLine2')} />
          <div className="form-row">
            <Input label="City" error={errors.shipCity?.message} {...register('shipCity')} />
            <Input label="Postal code" error={errors.shipPostal?.message} {...register('shipPostal')} />
            <div className="field">
              <label className="field__label" htmlFor="ship-country">
                Country
              </label>
              <select id="ship-country" className="field__input" aria-invalid={errors.shipCountry ? true : undefined} {...register('shipCountry')}>
                <option value="">Choose…</option>
                {LOCATIONS.map((l) => (
                  <option key={l.country} value={l.country}>
                    {l.label}
                  </option>
                ))}
              </select>
              {errors.shipCountry && <span className="field__error">{errors.shipCountry.message}</span>}
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}
