# Backend Audit

This file summarizes a quick sanity-check of **file necessity**, **route completeness**, and **env ↔ config** relationship.

## 1) What is required to run

Must-have (runtime):
- `src/index.ts` (Elysia app entry)
- `src/routes/**` (API routes)
- `src/middleware/**` (auth/csrf/rate-limit/error)
- `src/db/**` + `sqlite.db` (current project ships a SQLite file; without migrations this is the source of truth for table creation)
- `config/app.default.json` (baseline config)

Optional / dev-only:
- `tests/**` (Bun tests)
- `scripts/**` (audits and checks)
- `_archive/**` (legacy reference, not used by runtime)

## 2) Route completeness

Two checks are provided:
- `bun run check:routes` checks **duplicate registrations** and **non-semantic params** (`:id`, `:rid`)
- `bun run check:routes:doc` checks **ROUTES.md ↔ code** parity

Design rule: `ROUTES.md` must not include root routes (like `/about`) in backticks, otherwise tests interpret them as v1 endpoints.

## 3) env ↔ config relationship

Effective precedence:
1. `config/app.default.json`
2. `config/app.<NODE_ENV>.json`
3. environment variables (`.env`)

See `config/README.md` for the explicit mapping list.

Notes:
- CSRF is optional: enable with `CSRF_ENABLED=1` or `security.csrf.enabled=true`.
- Seed and student default passwords are **env-only** for safety: `SEED_PASSWORD`, `DEFAULT_STUDENT_PASSWORD`.

## 4) Build and deploy

- Local dev: `bun run dev`
- Run tests: `bun run test`
- Docker: build from `Dockerfile` (defaults to `NODE_ENV=production`).
