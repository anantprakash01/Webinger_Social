# Webinger Social — Creator Marketplace (frontend)

React 19 + TypeScript + Vite prototype of a two-sided creator marketplace with escrow payments.
Phase 0 runs entirely on an in-browser mock API; Phase 1 switches each module to the Spring Boot API.
Project decisions live in `CLAUDE (1).md` (rename to `CLAUDE.md` so Claude Code loads it automatically).

## Run

```bash
npm install
cp .env.example .env.local   # optional; mock mode is the default
npm run dev                  # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server. `/api` is proxied to `localhost:8080` for http mode. |
| `npm run build` | Typecheck + production build (with PWA service worker). |
| `npm test` | Vitest: fee calculator, ledger, order state machine, auth mock, routing. |
| `npm run lint` | ESLint (TypeScript + React hooks). |
| `npm run gen:api` | Regenerate `src/types/openapi.ts` from `docs/api/openapi.yaml`. |

## Environment

| Variable | Values | Default |
| --- | --- | --- |
| `VITE_API_MODE` | `mock` (in-browser fake API) or `http` (Spring Boot) | `mock` |
| `VITE_API_BASE_URL` | Base path of the real API | `/api/v1` |
| `VITE_MOCK_DELAY_MS` | Artificial mock latency so loading states show | `350` |

## Demo accounts (mock mode, password `demo1234`)

| Email | Role | State |
| --- | --- | --- |
| brand@demo.test | Brand | Verified, company "Saltbay Supply Co." |
| unverified@demo.test | Brand | Email not verified — checkout is blocked (FR-02) |
| creator@demo.test | Creator | Approved |
| newcreator@demo.test | Creator | Draft profile — lands on onboarding |
| admin@demo.test | Admin | — |

"Continue with Google" signs in as an invented Google identity. Emails (verification, password reset)
appear in a **demo inbox** box on the relevant screens. The demo bar inside the app has **View as** and
**Reset demo data**. Demo state lives in `sessionStorage`, so it survives a refresh but not a new tab.

## Layout

```
docs/api/openapi.yaml     API contract (single source of truth)
src/app/                  routes, auth context, guards, layouts (AppShell, PublicLayout), placeholder pages
src/features/auth/        schemas (Zod), hooks (TanStack Query), components, pages
src/api/client.ts         the only module that talks to a backend (mock | http), 401 → refresh → retry
src/api/mock/             db, fees, ledger, orderMachine, server (router) and handlers
src/components/ui/        Webinger base components
src/lib/                  money formatting, form error mapping
src/styles/               Webinger tokens + global styles
```
