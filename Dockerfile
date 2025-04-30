
# Base stage with Node.js and pnpm
FROM node:22.13.1-slim AS base
RUN apt-get update && \
  apt-get install -y curl && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* && \
  npm install -g pnpm
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsup.config.base.ts nx.json ./
COPY apps/starter/package.json ./apps/starter/
COPY packages/memory-filesystem/package.json ./packages/memory-filesystem/
COPY packages/memory-postgres/package.json ./packages/memory-postgres/
COPY packages/memory-sqlite/package.json ./packages/memory-sqlite/
COPY packages/model-ollama/package.json ./packages/model-ollama/
COPY packages/model-openai/package.json ./packages/model-openai/
COPY packages/plugin-character/package.json ./packages/plugin-character/
COPY packages/plugin-codex/package.json ./packages/plugin-codex/
COPY packages/plugin-discord/package.json ./packages/plugin-discord/
COPY packages/plugin-image/package.json ./packages/plugin-image/
COPY packages/plugin-mcp/package.json ./packages/plugin-mcp/
COPY packages/plugin-search/package.json ./packages/plugin-search/
COPY packages/plugin-telegram/package.json ./packages/plugin-telegram/
COPY packages/plugin-terminal/package.json ./packages/plugin-terminal/
COPY packages/plugin-text/package.json ./packages/plugin-text/
COPY packages/plugin-time/package.json ./packages/plugin-time/
COPY packages/plugin-websocket/package.json ./packages/plugin-websocket/
COPY packages/plugin-x/package.json ./packages/plugin-x/
COPY packages/core/package.json ./packages/core/
RUN pnpm install --frozen-lockfile --prefer-offline

# Builder stage
FROM deps AS builder
COPY ./packages ./packages
COPY ./apps/starter ./apps/starter
RUN pnpm build:starter

# Runner stage
FROM node:22.13.1-slim AS runner
WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/apps/starter ./apps/starter
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Set working directory to apps/starter
WORKDIR /app/apps/starter

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]