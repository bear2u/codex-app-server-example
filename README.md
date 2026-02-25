# Codex Web UI + Codex App Server

Monorepo with:

- `web-ui`: Next.js 16.1.6 chat UI
- `codex-app-server`: Fastify BFF that bridges to `codex app-server` over stdio JSON-RPC
- `packages/shared-contracts`: shared API/SSE contracts

## Preview

![Codex Chat UI Preview](./image.png)

Study guide:

- [MONOREPO_WORKFLOW.md](./MONOREPO_WORKFLOW.md): how root-level monorepo development and dual-server runtime work
- [WEB_UI_ENHANCEMENT_CHECKLIST.md](./WEB_UI_ENHANCEMENT_CHECKLIST.md): prioritized checklist for web-ui hardening/improvements

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
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 pnpm --filter web-ui dev
```

Open: `http://localhost:3000`

UI usage:

- You can select multiple images from the `Attach Images` button in the prompt composer.
- Sending only images (without text) is supported.
- Markdown code fences in Assistant/User messages (` ```lang ... ``` `) are rendered with syntax highlighting and a Copy button.
- You can set `cwd` when creating a thread via the sidebar `New Thread Workspace` field, and the active thread `Workspace` is shown next to `Thread ID`.

If you open UI via `http://127.0.0.1:3000`, keep `CORS_ORIGIN` including both:

```env
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
HTTP_BODY_LIMIT_MB=20
THREAD_MESSAGES_PAGE_SIZE=10
```

## Run (Docker Compose: nginx + web-ui + codex-app-server)

```bash
# optional: customize compose env
cp .env.docker.example .env

docker compose up --build
```

Open: `http://localhost:3000`

Notes:

- Services start together behind `nginx` gateway:
  - `nginx` exposed on host `3000`
  - `web-ui` internal (`web-ui:3000`)
  - `codex-app-server` internal (`codex-app-server:4000`)
- `/` and `/settings` are served via nginx.
- `/v1/*` and `/v1/events` are reverse-proxied via nginx.
- Tunnel ON from `/settings` starts `ngrok http http://nginx:80` in backend container.
- External ngrok public domains are protected by custom login page (`/tunnel-login`) + session gate.
- Admin tunnel control endpoints are localhost-only (`canManage=true` only from local host gateway).
- `codex` CLI is installed inside the backend container.
- `ngrok` CLI is installed inside the backend container.
- Set `NGROK_AUTHTOKEN` in root `.env` before turning tunnel ON.
- Host repository is mounted into backend container at `/workspace`.
- Codex auth/session data mount target is `/root/.codex`.
  - default: named volume `codex_home` (container-isolated)
  - optional: set `CODEX_HOME_MOUNT=/Users/<you>/.codex` in `.env` to reuse host Codex auth/thread state
- To stop/remove containers:

```bash
docker compose down
```

## ngrok Tunnel (Compose)

In Docker Compose, you can control ngrok tunnel ON/OFF at runtime from `/settings`.  
Tunnel password/session/state are memory-only (non-persistent) and are immediately cleared when set to `OFF`.

### 1) Environment Variables

`docker compose` loads only the root `.env` file by default.

- Default: set values in `.env`, then run `docker compose up --build`
- Separate file: run `docker compose --env-file .env.docker up --build`

Required value:

```env
NGROK_AUTHTOKEN=your_ngrok_authtoken
```

Get your token here: https://dashboard.ngrok.com

### 2) Usage Flow

1. `docker compose up --build`
2. Open `http://localhost:3000/settings`
3. Enter a tunnel password (minimum 8 chars, confirmation must match), then click `Tunnel ON`
4. When status becomes `ON`, a public URL is shown (for example `https://xxxx.ngrok-free.app`)
5. External users who open that URL are redirected to `/tunnel-login`; after password auth they return to the original path

### 3) Behavior and Security Rules

- A new tunnel URL may be issued each time you turn ON. Always use the latest URL shown in `/settings`.
- Only localhost admin can toggle ON/OFF (`canManage=true`)
- Remote users see `/settings` as read-only (`canManage=false`)
- Turning `Tunnel OFF` stops ngrok and immediately invalidates the tunnel password/sessions

### 4) Troubleshooting

- `TUNNEL_CONFIG_INVALID`: `NGROK_AUTHTOKEN` is missing
- `ERR_NGROK_107`: token is invalid/revoked (replace with a new token)
- `Tunnel process exited before obtaining a tunnel URL (code=1)`: check token/network/account state and retry
- `status=error`: check `Last error` in `/settings`, then retry `Tunnel ON`

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
- `GET /v1/tunnel/admin/state`
- `POST /v1/tunnel/admin/enable`
- `POST /v1/tunnel/admin/disable`
- `POST /v1/tunnel/public/login`
- `POST /v1/tunnel/public/logout`
- `GET /v1/tunnel/public/session/check`
