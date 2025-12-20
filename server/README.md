# server

## Install

```bash
bun install
```

## Run (development)

```bash
cp .env.example .env
bun run index.ts
```

## Configuration

- Environment variables: `.env` (see `.env.example`)
- JSON config files: `config/app.default.json` + optional `config/app.<NODE_ENV>.json`

Effective config priority (later overrides earlier):

1. `config/app.default.json`
2. `config/app.<NODE_ENV>.json`
3. Environment variables

See `config/README.md` for details.

## API

- Base: `GET /`
- OpenAPI: `GET /api/v1/swagger`
