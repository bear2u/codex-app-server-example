# Codex Web UI + Codex App Server

Monorepo with:

- `web-ui`: Next.js 16.1.6 chat UI
- `codex-app-server`: Fastify BFF that bridges to `codex app-server` over stdio JSON-RPC
- `packages/shared-contracts`: shared API/SSE contracts

Study guide:

- [MONOREPO_WORKFLOW.md](./MONOREPO_WORKFLOW.md): how root-level monorepo development and dual-server runtime work

## Requirements

- Node.js `>=20.9.0` (project pinned to `v22.22.0` in `.nvmrc`)
- pnpm `10.x`
- `codex` CLI installed and executable in PATH

## Install

```bash
pnpm install
```

## Run (No Docker)

Terminal 1:

```bash
cp codex-app-server/.env.example codex-app-server/.env
pnpm --filter codex-app-server dev
```

Terminal 2:

```bash
pnpm --filter web-ui dev
```

Open: `http://localhost:3000`

If you open UI via `http://127.0.0.1:3000`, keep `CORS_ORIGIN` including both:

```env
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
THREAD_MESSAGES_PAGE_SIZE=10
```

## Root Scripts

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## API Surface

- `POST /v1/auth/chatgpt/start`
- `POST /v1/auth/chatgpt/cancel`
- `GET /v1/auth/state`
- `GET /v1/models`
- `POST /v1/threads`
- `POST /v1/threads/:threadId/resume`
- `GET /v1/threads`
- `GET /v1/threads/:threadId/messages?cursor=&limit=`
- `GET /v1/threads/:threadId`
- `POST /v1/threads/:threadId/turns`
- `POST /v1/threads/:threadId/turns/:turnId/steer`
- `POST /v1/threads/:threadId/turns/:turnId/interrupt`
- `POST /v1/approvals/command`
- `POST /v1/approvals/file-change`
- `GET /v1/events` (SSE)
