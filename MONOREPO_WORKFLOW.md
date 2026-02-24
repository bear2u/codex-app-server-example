# Monorepo Workflow Guide

이 문서는 현재 레포에서 `web-ui` + `codex-app-server`를 루트 기준으로 함께 개발/실행할 때, 실제로 무엇이 어떻게 연결되는지 설명합니다.

## 1) 구조 한눈에 보기

```text
/
  package.json                 # turbo 실행 엔트리
  pnpm-workspace.yaml          # 워크스페이스 패키지 범위
  turbo.json                   # 태스크 실행 규칙
  /web-ui                      # Next.js 16.1.6 (브라우저 UI)
  /codex-app-server            # Fastify BFF (API + SSE + JSON-RPC 브리지)
  /packages/shared-contracts   # 공용 타입(API/SSE 계약)
```

역할 분리:

- `web-ui`: 브라우저 렌더링, `/v1/*` 호출, `/v1/events` SSE 구독
- `codex-app-server`: REST/SSE 제공, `codex app-server`를 stdio(JSON-RPC)로 제어
- `shared-contracts`: 프론트/백엔드가 같은 타입을 사용하도록 강제

## 2) 모노레포가 동작하는 방식

### pnpm workspace

`pnpm-workspace.yaml`:

```yaml
packages:
  - "web-ui"
  - "codex-app-server"
  - "packages/*"
```

이 설정으로 루트에서 `pnpm install` 하면 각 패키지를 하나의 워크스페이스로 묶고,  
`workspace:*` 의존성(예: `@codex-app/shared-contracts`)은 로컬 패키지로 링크됩니다.

### Turborepo

루트 `package.json`:

```json
"scripts": {
  "dev": "turbo run dev --parallel",
  "build": "turbo run build",
  "lint": "turbo run lint",
  "test": "turbo run test",
  "typecheck": "turbo run typecheck"
}
```

즉, 루트에서 명령을 한 번 치면 `web-ui`, `codex-app-server`, `shared-contracts` 쪽 태스크를 그래프 기준으로 실행합니다.

## 3) `pnpm --filter`가 하는 일

`--filter`는 워크스페이스 전체 중 특정 패키지에만 명령을 보내는 기능입니다.

예시:

```bash
pnpm --filter web-ui dev
pnpm --filter codex-app-server dev
pnpm --filter @codex-app/shared-contracts build
```

이 프로젝트에서의 체감:

- 두 서버를 개별 터미널에서 독립 실행할 때 유용
- 문제 발생 시 어느 쪽 프로세스가 죽었는지 분리해서 보기 쉬움

## 4) 실제 실행 패턴 2가지

### A. 권장(디버깅 쉬움): 터미널 2개

터미널 1:

```bash
pnpm --filter codex-app-server dev
```

터미널 2:

```bash
pnpm --filter web-ui dev
```

### B. 한 번에 실행

```bash
pnpm dev
```

내부적으로 `turbo run dev --parallel`이 두 앱의 `dev`를 동시에 올립니다.

## 5) 런타임 요청/이벤트 흐름

```text
Browser (web-ui)
  -> HTTP fetch (/v1/*)
Fastify (codex-app-server routes)
  -> Service layer (auth/thread/turn/approval)
  -> JsonRpcClient
  -> stdio
codex app-server (child process)
  -> JSON-RPC response/notification
JsonRpcClient + NotificationRouter
  -> UiEventBus
  -> SSE (/v1/events)
Browser EventSource
  -> event-reducer
  -> React UI 업데이트
```

핵심 포인트:

- 브라우저는 `codex` 프로세스와 직접 통신하지 않습니다.
- 모든 브라우저 통신은 `codex-app-server`를 거칩니다(BFF 패턴).
- 실시간 출력은 SSE 한 채널(`/v1/events`)로 받습니다.

## 6) 왜 `predev`에서 shared-contracts를 먼저 빌드하나

`web-ui`와 `codex-app-server`의 `package.json`에 `predev`가 있습니다:

- `pnpm --filter @codex-app/shared-contracts build`

의미:

- 앱 실행 전에 공용 타입 패키지를 먼저 컴파일
- 타입 불일치(프론트/백엔드 계약 깨짐)를 초기에 발견

## 7) 포트/환경 변수 정리

기본 포트:

- `web-ui`: `3000`
- `codex-app-server`: `4000`

주요 env(`codex-app-server/.env`):

- `HOST`, `PORT`: Fastify 바인딩
- `CORS_ORIGIN`: 브라우저 Origin 허용 목록
- `CODEX_BIN`: 기본 `codex` (로컬 CLI 경로)
- `CODEX_CWD`: codex가 작업할 루트 경로
- `CODEX_MODEL`: 기본 모델
- `CODEX_APPROVAL_POLICY`: 승인 정책
- `CODEX_WRITABLE_ROOTS`: 쓰기 허용 루트
- `CODEX_NETWORK_ACCESS`: 네트워크 허용 여부
- `HTTP_BODY_LIMIT_MB`: HTTP JSON 바디 최대 크기(MB, 이미지 첨부 시 중요)
- `SSE_HEARTBEAT_MS`: SSE heartbeat 주기
- `THREAD_MESSAGES_PAGE_SIZE`: 채팅 히스토리 기본 페이지 크기(기본 `10`)

## 8) 상태 표시를 읽는 법

UI 상단의 연결 상태는 SSE 연결 상태를 의미합니다.

- `Connecting...`: EventSource 연결 시도 중
- `Connected`: `/v1/events` 연결 정상
- `Reconnecting...`: 연결 끊겨 재시도 중

주의:

- `Connected`는 "UI ↔ BFF SSE 연결" 기준입니다.
- Codex 계정 인증 상태(`Auth: ...`)와는 별개입니다.

## 9) 자주 겪는 문제와 원인

### 1. `Failed to fetch`

원인:

- `codex-app-server` 미실행
- API base 주소/포트 불일치
- CORS 미허용

확인:

```bash
curl http://localhost:4000/healthz
```

### 2. `Event stream disconnected. Retrying automatically...`

원인:

- `/v1/events` SSE 연결이 끊김
- 서버 재시작/중단
- CORS 또는 네트워크 문제

### 3. OAuth/MCP 관련 `404` 로그

브라우저 확장이나 외부 도구가 찍는 경로(`/.well-known/...`, `/api/mcp`)일 수 있습니다.  
현재 프로젝트의 공식 백엔드 경로는 `codex-app-server`의 `/v1/*` 및 `/healthz`입니다.

## 10) 공부 순서 추천

1. `pnpm-workspace.yaml` + 루트 `package.json` + `turbo.json` 먼저 읽기
2. `codex-app-server/src/app.ts`에서 의존성 조립 구조 파악
3. `routes/* -> services/* -> rpc/*` 순서로 추적
4. `web-ui/lib/api-client.ts`, `web-ui/lib/sse-client.ts`, `web-ui/lib/event-reducer.ts` 읽기
5. 실제로 터미널 2개로 실행해 요청/이벤트가 흐르는지 로그 관찰
