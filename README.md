# Webinger Collab

A two-sided marketplace where Indian brands book and pay social media creators, with payment held in escrow until the brand approves the work.

| Folder | What | Stack |
| --- | --- | --- |
| [`frontend/`](frontend/) | React app (brand, creator, admin and public screens) with an in-browser mock API | React 19, TypeScript, Vite |
| [`collab/`](collab/) | Backend API | Java 21, Spring Boot 4, MySQL 8, Flyway |

The API contract is [`frontend/docs/api/openapi.yaml`](frontend/docs/api/openapi.yaml): the frontend's mock and the backend implement the same paths, JSON shapes, error codes and rules. Backend rules per module: [`frontend/docs/backend-handover.md`](frontend/docs/backend-handover.md).

## Run

```bash
# Frontend on the in-browser mock (no backend needed)
cd frontend && npm install && npm run dev            # http://localhost:5173

# Backend with an in-memory database and the demo accounts (no MySQL needed)
cd collab && ./mvnw spring-boot:run -Dspring-boot.run.profiles=h2   # http://localhost:8080/api/v1

# Backend with MySQL (Docker Desktop running)
cd collab && docker compose up -d && ./mvnw spring-boot:run

# Frontend against the backend
cd frontend && VITE_API_MODE=http npm run dev        # the dev server proxies /api to :8080
```

## Working on it

Short-lived branches from `main`, one module per branch, a pull request for each. See `CLAUDE.md` and `frontend/CLAUDE.md`.
