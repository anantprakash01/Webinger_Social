# Webinger Social — Creator Marketplace (frontend)

React 19 + TypeScript + Vite prototype of a two-sided creator marketplace with escrow payments.
Phase 0 runs entirely on an in-browser mock API; Phase 1 switches each module to the Spring Boot API.
Project decisions and current status live in `CLAUDE.md`.

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
| `npm run gen:art` | Regenerate the abstract demo images in `public/demo/`. |
| `npm run check:layout` | With `npm run dev` running: checks key screens at 360 px and 1280 px in Microsoft Edge (no sideways scroll, no console errors). Pass a base URL and a folder to also save screenshots. |

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

The marketplace has 59 invented, approved creators to search (plus 4 not yet approved, which never appear).
Try `/search`, `/u/leomakes`, or press **Buy** on a profile while logged out.

"Continue with Google" signs in as an invented Google identity. Emails (verification, password reset)
appear in a **demo inbox** box on the relevant screens. The demo bar inside the app has **View as** and
**Reset demo data**. Demo state lives in `sessionStorage`, so it survives a refresh but not a new tab.

## Layout

```
docs/api/openapi.yaml     API contract (single source of truth)
src/app/                  routes, auth context, guards, layouts (AppShell, PublicLayout), placeholder pages
src/features/auth/        schemas (Zod), hooks (TanStack Query), components, pages
src/features/landing/     landing page
src/features/search/      search page, filters, creator card, URL <-> query mapping
src/features/creators/    public creator profile
src/api/client.ts         the only module that talks to a backend (mock | http), 401 → refresh → retry
src/api/mock/             db, seed, fees, ledger, orderMachine, server (router) and handlers
src/components/ui/        Webinger base components
src/lib/                  money formatting, catalog (platforms, niches, locations), form error mapping
src/styles/               Webinger tokens + global styles
```
