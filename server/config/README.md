# Config

This project supports **JSON config files** under `config/` and **environment variables** via `.env`.

Loading order (later overrides earlier):

1. `config/app.default.json`
2. `config/app.<NODE_ENV>.json` (optional)
3. Environment variables (e.g. `PORT`, `JWT_SECRET`, `DATABASE_URL`, ...)

## Files

- `app.default.json`: baseline defaults
- `app.development.json`: development overrides
- `app.production.json`: production overrides
- `app.test.json`: test overrides (disables rate limit and DB logging)

## Environment variables

See `.env.example`.
