# syntax=docker/dockerfile:1

# ----------------------------------------------------------------------------
# Builder: install workspace deps (incl. native better-sqlite3) and compile.
# ----------------------------------------------------------------------------
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app

# Layer-cache dependency installation.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/strategies/package.json packages/strategies/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @phantom-meme-bot/core build \
 && pnpm --filter @phantom-meme-bot/strategies build \
 && pnpm --filter @phantom-meme-bot/cli build \
 && pnpm --filter @phantom-meme-bot/web build

# ----------------------------------------------------------------------------
# Bot: headless strategy engine (CLI `run`).
# ----------------------------------------------------------------------------
FROM node:22-slim AS bot
ENV NODE_ENV=production LOG_JSON=true DATABASE_PATH=/data/bot.db
WORKDIR /app
COPY --from=builder /app /app
VOLUME /data
# No private key is baked into the image — supply configuration (and, for
# live mode only, a burner key) via environment variables at runtime.
CMD ["node", "apps/cli/dist/main.js", "run"]

# ----------------------------------------------------------------------------
# Web: Next.js dashboard.
# ----------------------------------------------------------------------------
FROM node:22-slim AS web
RUN corepack enable
ENV NODE_ENV=production DATABASE_PATH=/data/bot.db
WORKDIR /app
COPY --from=builder /app /app
VOLUME /data
EXPOSE 3000
CMD ["pnpm", "--filter", "@phantom-meme-bot/web", "start"]
