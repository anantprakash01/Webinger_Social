/**
 * Zod schemas for auth. They mirror the backend Bean Validation rules (convention 6):
 * the forms use them for instant feedback, and the mock API uses the same request schemas
 * so it answers 422 exactly where the backend would.
 */
import { z } from 'zod';
import type { FieldError } from '@/types';

export const PASSWORD_RULES = [
  { id: 'len', text: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'mix', text: 'A letter and a number', test: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p) },
] as const;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'Enter your email address.' })
  .max(254, { error: 'That email is too long.' })
  .pipe(z.email({ error: 'Enter a valid email address.' }));

export const passwordSchema = z
  .string()
  .min(8, { error: 'Use at least 8 characters.' })
  .max(128, { error: 'Use at most 128 characters.' })
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), { error: 'Use at least one letter and one number.' });

export const nameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Enter at least 2 characters.' })
  .max(80, { error: 'Use at most 80 characters.' });

export const signupRoleSchema = z.enum(['BRAND', 'CREATOR'], { error: 'Choose whether you are a brand or a creator.' });

/* ---------- Request bodies (match docs/api/openapi.yaml) ---------- */

export const registerRequestSchema = z.object({
  role: signupRoleSchema,
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: 'Accept the terms to create an account.' }),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password.' }),
});

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, { error: 'The reset link is incomplete.' }),
  password: passwordSchema,
});

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1, { error: 'The verification link is incomplete.' }),
});

export const googleAuthRequestSchema = z.object({
  idToken: z.string().min(1),
  role: signupRoleSchema.optional(),
});

export const updateMeRequestSchema = z.object({ name: nameSchema.optional() });

/* ---------- Form-only schemas ---------- */

export const signupFormSchema = registerRequestSchema;
export type SignupForm = z.input<typeof signupFormSchema>;

export const loginFormSchema = loginRequestSchema;
export type LoginForm = z.input<typeof loginFormSchema>;

export const forgotPasswordFormSchema = forgotPasswordRequestSchema;
export type ForgotPasswordForm = z.input<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: 'Passwords do not match.', path: ['confirm'] });
export type ResetPasswordForm = z.input<typeof resetPasswordFormSchema>;

/** Zod issues → the `errors` array of a 422 problem+json, first message per field. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  const byField = new Map<string, string>();
  for (const i of error.issues) {
    const field = i.path.map(String).join('.') || 'body';
    if (!byField.has(field)) byField.set(field, i.message);
  }
  return [...byField].map(([field, message]) => ({ field, message }));
}
