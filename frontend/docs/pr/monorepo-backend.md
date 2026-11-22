# One repository for frontend and backend; backend foundation and auth (Phase 1, Weeks 7–8)

## What changes
- **Repository layout:** the React app moves into `frontend/` and the Spring Boot API is added in `collab/`.
  - Git records the move as 323 pure renames, so `git log --follow` still shows every file's history.
  - The root `README.md` explains how to run both apps.
  - The root `CLAUDE.md` holds the backend rules: match the mock exactly, build module by module, money in paise, problem+json errors.
- **Backend foundation** (`collab/`): Java 21, Spring Boot 4.2, MySQL 8 with Flyway, and `docker-compose.yml` for local MySQL.
  - `h2` profile: runs with an in-memory database and the demo accounts, so you can start it without Docker.
  - `demo` profile: adds the demo accounts and helpers on a real database.
- **Auth and `/me`, matching the frontend's mock:**
  - **Endpoints:** register, login, refresh, logout, Google sign-in, verify email (and resend, at most 5 an hour), forgot and reset password (30-minute link); `GET`/`PATCH /me` and `PUT /me/avatar`.
  - **Tokens:** 15-minute JWT access tokens. Refresh tokens rotate and live in an httpOnly cookie limited to `/api/v1/auth`. Reusing an old refresh token ends that whole session.
  - **Session rules:** signing out, resetting a password or being suspended ends access tokens immediately.
  - **Errors:** the same status codes, error codes (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `REFRESH_REUSED`, `ACCOUNT_SUSPENDED`, …) and field messages as the mock, as RFC 7807 problem+json.
  - **Passwords:** stored with BCrypt (cost 12). Refresh tokens and email links are stored only as SHA-256 hashes.
  - **Google sign-in:** real ID tokens are verified against Google's keys. The mock's demo token is accepted only in demo mode.
  - **Demo:** the same demo accounts and ids as the frontend's mock, plus `GET /dev/outbox` for the demo inbox (demo mode only).
  - **Impersonation:** a read-only admin "view as" session gets 403 `READ_ONLY_IMPERSONATION` on any change, as in the mock.

## Checks
- `./mvnw test`: 20 tests pass, on H2 without Docker.
  - The 14 cases of the mock's `auth.test.ts`, ported.
  - 5 cases for `/me`, including the suspended-account sign-out.
  - The app starts with the Flyway schema, which Hibernate validates.
- **Live check:** the frontend in `VITE_API_MODE=http` against the running backend.
  - A wrong password shows the server's message.
  - Sign-in lands on the dashboard, and reloading keeps you signed in through the refresh cookie.
  - Settings shows the name, sign-out works, and sign-up goes to the email check page.
  - Screens for modules not built yet show their error state ("No endpoint …").
- Frontend: `tsc` is clean after the move.

## Not yet
- Referral codes at sign-up are accepted but ignored until the promos module is ported.
- Login rate limiting (10 per 15 minutes per IP) comes with launch readiness.
- **Next module:** creators, search and vetting (Weeks 9–11). Then those screens switch to the real API.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
