# syntax=docker/dockerfile:1
FROM oven/bun:1

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY src ./src
COPY config ./config
COPY ROUTES.md REQUIRE.md README.md ./

# Optional: ship a pre-built sqlite.db for demo/testing.
# In production, mount /app/sqlite.db or set DATABASE_URL.
COPY sqlite.db ./sqlite.db

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "src/index.ts"]
