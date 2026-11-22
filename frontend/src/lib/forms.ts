/**
 * Maps a 422 problem+json onto React Hook Form fields (convention 6).
 * Returns the message to show above the form, or null when every error landed on a field.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/types';

export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: ReadonlyArray<Path<T>>): string | null {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Something went wrong. Try again.';
  let unplaced = false;
  for (const fe of error.fieldErrors) {
    if ((fields as readonly string[]).includes(fe.field)) setError(fe.field as Path<T>, { type: 'server', message: fe.message });
    else unplaced = true;
  }
  if (error.fieldErrors.length === 0 || unplaced) return error.message;
  return null;
}
