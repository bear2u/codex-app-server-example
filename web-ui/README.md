# web-ui

Next.js 16.1.6 frontend for Codex chat.

## Run

```bash
pnpm --filter web-ui dev
```

`NEXT_PUBLIC_API_BASE_URL` is optional.

- Docker Compose + nginx gateway: usually omit it (same-origin `/v1` through `localhost:3000` or ngrok public domain)
- Local dev with standalone backend (`localhost:4000`): set it explicitly

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

## Pages

- `/` : chat console
- `/settings` : tunnel ON/OFF + public URL view + password setup
- `/tunnel-login` : password login for external access (ngrok public domain)
