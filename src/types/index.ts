/**
 * App-facing names for the generated contract types.
 * Never edit src/types/openapi.ts by hand: change docs/api/openapi.yaml and run `npm run gen:api`.
 */
import type { components } from './openapi';

type S = components['schemas'];

export type Money = S['Money'];
export type Problem = S['Problem'];
export type FieldError = S['FieldError'];
export type PageMeta = S['PageMeta'];
export type Page<T> = PageMeta & { content: T[] };

export type Role = S['Role'];
export type SignupRole = S['SignupRole'];
export type UserStatus = S['UserStatus'];
export type VettingStatus = S['VettingStatus'];
export type Me = S['Me'];
export type UpdateMeRequest = S['UpdateMeRequest'];

export type AuthSession = S['AuthSession'];
export type RegisterRequest = S['RegisterRequest'];
export type LoginRequest = S['LoginRequest'];
export type GoogleAuthRequest = S['GoogleAuthRequest'];
export type ResetPasswordRequest = S['ResetPasswordRequest'];

export const ROLE_LABEL: Record<Role, string> = {
  BRAND: 'Brand',
  CREATOR: 'Creator',
  ADMIN: 'Admin',
};

/** Error thrown by the API client for any non-2xx answer (RFC 7807 problem+json). */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors: FieldError[];
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.fieldErrors = problem.errors ?? [];
    this.problem = problem;
  }
}
