FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY codex-app-server ./codex-app-server

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @codex-app/shared-contracts build
RUN pnpm --filter codex-app-server build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && npm install -g @openai/codex@0.104.0

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/codex-app-server ./codex-app-server

EXPOSE 4000

CMD ["node", "codex-app-server/dist/main.js"]
