# Webinger Collab — repository guide for Claude

One repository, two apps (decided 22 Nov 2026):

- `frontend/` — React app and in-browser mock API. **Read `frontend/CLAUDE.md` first**: it holds every product decision, requirement (FR ids), the order state machine, money rules and the current state.
- `collab/` — Spring Boot backend (Java 21, Spring Boot 4.2, MySQL 8, Flyway). Package `com.webinger.collab`.

## Rules for the backend

1. **Match the frontend exactly.** `frontend/docs/api/openapi.yaml` is the contract. The mock handlers in `frontend/src/api/mock/` are the reference behaviour: same paths under `/api/v1`, same JSON field names and nullability, same status codes, same problem+json `code` values, same validation messages where the UI shows them. When in doubt, read the mock handler and its `*.test.ts`, and port those tests.
2. Build module by module in the order of `frontend/CLAUDE.md` §11: foundation + auth → creators/search/vetting → orders/payments/ledger/payouts/chat/notifications/campaigns → admin, disputes, plans, promos, finance. Each module: Flyway migration → entities/repositories → service → controller → tests ported from the mock tests.
3. Money is `long` paise everywhere (fields keep the `Cents` suffix). Never `double`. Fees and taxes are copied onto the order at checkout. Every money movement is a balanced ledger transaction.
4. Errors are RFC 7807 `application/problem+json` with `type`, `title`, `status`, `detail`, `code` and, for 422, `errors: [{field, message}]` (see `common/web/ApiException` and `GlobalExceptionHandler`).
5. Module layout: `com.webinger.collab.<module>.{web,service,domain,repository}`. A module calls another module's service, never its repository.
6. Tests: JUnit 5 + MockMvc against H2 in MySQL mode (`test` profile); they must not need Docker. Keep migrations portable between MySQL 8 and H2.
7. Secrets never in code: `application.yml` reads them from the environment; dev defaults are clearly marked.

## Branches and pull requests

- Branch from the latest `main`; one module or feature per branch; open a PR with a full description (template: `frontend/docs/pr/*.md`), never a bare push. Ask before pushing.
- Commit messages reference FR ids; end with the Co-Authored-By line.

## Commands

- Backend: `cd collab && ./mvnw test` · run `./mvnw spring-boot:run -Dspring-boot.run.profiles=h2` (in-memory DB + demo accounts) or with MySQL via `docker compose up -d`.
- Frontend: see `frontend/CLAUDE.md` (`npm test`, `npm run build`, `npm run check:contract`, …).
