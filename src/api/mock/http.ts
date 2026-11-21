/**
 * Request/response shapes and helpers shared by the mock handlers.
 * The mock behaves like the Spring Boot API: same paths, status codes and problem+json bodies.
 */
import type { z } from 'zod';
import { toFieldErrors } from '@/features/auth/schemas';
import type { FieldError, Problem } from '@/types';
import type { UserRow } from './db';

export interface MockRequest {
  method: string;
  /** Path after /api/v1, without the query string, e.g. "/auth/login". */
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
  /** Stands in for the httpOnly refresh-token cookie. */
  refreshCookie: string | null;
}

export interface MockResponse {
  status: number;
  body?: unknown;
  /** undefined = leave the cookie alone, null = clear it, string = set it. */
  setRefreshCookie?: string | null;
}

export interface HandlerContext {
  req: MockRequest;
  params: Record<string, string>;
  /** Present on routes marked `auth: true`; on `auth: 'optional'` routes only when a token was sent. */
  user: UserRow;
  /** Set during a read-only admin impersonation session (FR-82): the admin's name. */
  impersonatedBy?: string | null;
}

export type Handler = (ctx: HandlerContext) => MockResponse;

/** Thrown by handlers; the server turns it into a problem+json response. */
export class HttpError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
}

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
};

export function fail(status: number, detail: string, code?: string, errors?: FieldError[]): never {
  throw new HttpError({ type: 'about:blank', status, title: TITLES[status] ?? 'Error', detail, code, errors });
}

/** Parses a request body with a Zod schema, answering 422 with field errors like Bean Validation. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) fail(422, 'Some fields need your attention.', 'VALIDATION_FAILED', toFieldErrors(r.error));
  return r.data;
}

export const ok = (body?: unknown, status = 200): MockResponse => ({ status, body });
