# Codex App Server 정리

Codex를 “우리 제품 안에” 깊게 심고 싶을 때 쓰는 게 **Codex App Server**예요. 예를 들어 VS Code 확장처럼 **인증, 대화 기록, 승인(approvals), 에이전트 이벤트 스트리밍**까지 포함한 “리치 클라이언트”를 만들고 싶다면 이 프로토콜을 사용합니다.

반대로, 단순히 CI에서 자동 실행하거나 배치 작업처럼 “잡”을 돌리는 목적이면 App Server보다 **Codex SDK**를 쓰는 쪽이 맞다고 문서에서 안내해요.

---

## App Server가 해결하는 문제

제일 중요한 포인트는 이거예요.

- 우리는 “Codex가 일을 하는 과정”을 **우리 UI/제품 안에서 실시간으로 보여주고** 싶다
- 중간에 **승인(명령 실행/파일 수정)** 같은 안전장치를 끼우고 싶다
- 사용자의 **대화/세션(히스토리)**을 유지하고 싶다

App Server는 그걸 위한 **클라이언트 ↔ Codex 사이의 표준 통신 규격**(프로토콜)을 제공해요.

---

## 전체 구조 한 장 요약

App Server는 “서버”라기보다 **Codex가 제공하는 로컬 프로세스/서비스**에 가깝고, 우리는 그와 통신하는 **클라이언트**를 만들게 됩니다.

- 클라이언트: 여러분의 제품(웹앱/데스크톱앱/IDE 플러그인)
- codex app-server: JSON-RPC 메시지를 받아 처리하고, 이벤트를 스트리밍으로 내보냄

통신 방식은 2가지가 있어요.

- **stdio** (기본): 표준입출력으로 JSONL(한 줄에 JSON 1개) 주고받기
- **websocket** (실험적): WebSocket 텍스트 프레임 1개당 JSON-RPC 메시지 1개

---

## 프로토콜 핵심은 JSON-RPC 2.0

`codex app-server`는 MCP처럼 **JSON-RPC 2.0 기반 양방향 통신**을 합니다. 다만 문서에 따르면 wire에서는 `"jsonrpc":"2.0"` 헤더를 생략합니다.

메시지 3종만 기억하면 돼요.

1. **Request**: `method`, `params`, `id` 포함
2. **Response**: 같은 `id`로 `result` 또는 `error` 반환
3. **Notification**: 이벤트 스트림(진행 상황). `id` 없음

예시 형태:

```json
{ "method": "thread/start", "id": 10, "params": { "model": "gpt-5.1-codex" } }
```

```json
{ "id": 10, "result": { "thread": { "id": "thr_123" } } }
```

```json
{ "method": "turn/started", "params": { "turn": { "id": "turn_456" } } }
```

---

## WebSocket 모드에서 꼭 알아야 할 과부하 처리

WebSocket 모드는 “bounded queue”를 쓰고, 서버가 바쁘면 새 요청을 **JSON-RPC 에러 코드 `-32001`**로 거절할 수 있어요. 이때 클라이언트는 **지수 백오프 + 지터**로 재시도하라고 명시돼 있습니다.

실무 팁: 처음 붙일 땐 stdio로 시작해서 안정적으로 흐름을 잡고, 필요하면 WebSocket으로 확장하는 걸 추천해요.

---

## 5분 만에 따라가는 최소 동작 흐름

문서가 제시하는 “가장 기본 시나리오”는 다음 순서입니다.

1. `codex app-server` 실행 (stdio 기본) 또는 `--listen ws://...`로 WebSocket 실행
2. 연결되면 **반드시** `initialize` 요청을 보내고, 바로 `initialized` 알림을 보냄
3. `thread/start`로 대화 세션 생성
4. `turn/start`로 사용자 입력을 보내고
5. 이후에는 stdout/소켓에서 계속 **notification 스트림**을 읽으면서 UI를 갱신

Node 예제가 문서에 있고, 핵심은 “JSON을 한 줄로 보내고(line-delimited), 한 줄씩 읽어서 파싱한다”입니다.

---

## Thread Turn Item 개념 잡기

여기서부터는 App Server를 이해하는 핵심 용어 3개예요.

- **Thread**: 사용자와 Codex 에이전트의 “대화방” (turn을 담음)
- **Turn**: 사용자 요청 1번 + 그 뒤에 이어지는 에이전트 작업 묶음
- **Item**: turn 안에서 발생하는 작업 단위(메시지, 명령 실행, 파일 변경, 툴콜 등)

비유로 보면:

- Thread = “채팅방”
- Turn = “사용자가 보낸 한 번의 질문과 그 처리 과정”
- Item = “처리 과정 중에 생기는 이벤트/결과 조각들”

---

## 연결 초기화는 무조건 해야 함

초기화는 “예의”가 아니라 “필수”입니다.

- 연결당 `initialize`는 **딱 1번**
- 그 전에 다른 요청을 보내면 **Not initialized 에러**
- 같은 연결에서 다시 `initialize`하면 **Already initialized**

그리고 `clientInfo`에 내 제품 정보를 넣어서 어떤 클라이언트인지 식별하게 되어 있어요.

---

## Experimental API는 명시적으로 켜야 함

일부 메서드/필드는 실험용이라서, `initialize.params.capabilities.experimentalApi = true`를 설정해야 사용할 수 있어요.

이걸 안 켜고 실험 기능을 호출하면 서버가 다음 형태로 거절합니다.

- `<descriptor> requires experimentalApi capability`

---

## 초급자가 자주 쓰는 API 지도

문서의 “API overview”에 핵심 메서드들이 정리돼 있어요.
아래만 먼저 익히면 흐름이 잡힙니다.

### Thread 관련

- `thread/start`: 새 대화 시작
- `thread/resume`: 기존 thread 이어가기
- `thread/fork`: 기존 대화를 복사해서 새 thread로 분기
- `thread/read`: 구독/재개 없이 저장된 내용만 읽기
- `thread/list`: 히스토리 목록 UI 만들 때
- `thread/archive`, `thread/unarchive`: 보관/복구
- `thread/compact/start`: 대화 컨텍스트 압축 트리거

### Turn 관련

- `turn/start`: 사용자 입력 보내고 에이전트 실행 시작
- `turn/steer`: 진행 중인 turn에 추가 지시 붙이기
- `turn/interrupt`: 진행 중인 turn 취소

### 기타 유용

- `review/start`: 코드 리뷰 모드 실행
- `command/exec`: thread 없이 단발 명령 실행
- `model/list`: 모델/옵션 목록 가져오기
- `experimentalFeature/list`: 기능 플래그 목록

---

## Turn start에서 자주 만지는 파라미터

`turn/start`는 “일 시키는 시작 버튼”이고, 여기서 안전/품질 옵션을 많이 건드립니다.

- `input`: 텍스트/이미지/로컬 이미지 등 item 리스트
- `cwd`: 작업 디렉토리
- `approvalPolicy`: 승인 정책
- `sandboxPolicy`: 샌드박스 정책
- `model`, `effort`, `summary`, `personality` 등 옵션
- `outputSchema`: 이번 turn에만 적용되는 출력 스키마

문서 예시에는 아래처럼 들어갑니다.

```json
{
  "method": "turn/start",
  "id": 30,
  "params": {
    "threadId": "thr_123",
    "input": [{ "type": "text", "text": "Run tests" }],
    "cwd": "/Users/me/project",
    "approvalPolicy": "unlessTrusted",
    "sandboxPolicy": {
      "type": "workspaceWrite",
      "writableRoots": ["/Users/me/project"],
      "networkAccess": true
    },
    "model": "gpt-5.1-codex",
    "effort": "medium",
    "summary": "concise",
    "personality": "friendly",
    "outputSchema": {
      "type": "object",
      "properties": { "answer": { "type": "string" } },
      "required": ["answer"],
      "additionalProperties": false
    }
  }
}
```

---

## Turn steer는 언제 쓰고 무엇이 다른가

`turn/steer`는 “새 turn을 만들지 않고” 진행 중인 작업에 추가로 말 거는 기능입니다.

- `expectedTurnId`가 필요하고, 현재 active turn과 일치해야 함
- active turn이 없으면 실패
- 새 `turn/started` 이벤트를 내보내지 않음
- `model`, `cwd`, `sandboxPolicy`, `outputSchema` 같은 turn-level override는 받지 않음

---

## 샌드박스와 보안 감각을 여기서 잡아야 함

Codex가 명령 실행/파일 변경을 할 수 있기 때문에, 제품에 넣을 때는 샌드박스 정책을 이해해야 안전합니다.

문서에는 read-only 접근을 “루트 제한” 형태로 설정하는 구조가 나오고, `readOnly`와 `workspaceWrite`에 각각 읽기 범위 제어 옵션이 있어요.

예를 들면:

- `workspaceWrite`로 쓰기는 특정 루트만 허용
- 읽기도 `restricted`로 제한 가능
- `networkAccess`도 켜고 끌 수 있음

또 이미 외부에서 샌드박스를 적용하고 있다면 `externalSandbox`를 써서 Codex의 자체 샌드박스 강제를 스킵하는 옵션도 있습니다.

---

## 이벤트 스트리밍을 이해하면 UI 구현이 쉬워진다

Thread를 시작/재개한 뒤에는 **계속 스트림을 읽으면서** 화면을 갱신해야 합니다. 문서가 명시적으로 `thread/*`, `turn/*`, `item/*` 알림을 계속 읽으라고 해요.

### Turn 이벤트

대표적으로:

- `turn/started`
- `turn/completed` (completed/interrupted/failed)
- `turn/diff/updated`
- `turn/plan/updated`
- `thread/tokenUsage/updated`

그리고 중요 포인트: `turn/diff/updated`나 `turn/plan/updated`는 **items 배열이 비어 있을 수 있으니**, turn 내부의 실제 item 상태는 `item/*` 알림을 “진짜 소스”로 삼으라고 안내합니다.

### Item 이벤트

Item에는 공통 생명주기가 있습니다.

- `item/started`: 작업이 시작될 때 item 전체를 보냄
- `item/completed`: 끝났을 때 최종 item을 보냄. **이걸 authoritative state로 취급**

그리고 스트리밍 델타도 있어요.

- `item/agentMessage/delta`: 에이전트 텍스트가 글자/토큰 단위로 늘어남
- `item/commandExecution/outputDelta`: 명령 실행 stdout/stderr 스트림
- 기타 plan/reasoning 델타들

### Item 타입 예시

UI를 만들 때 자주 마주칠 것들:

- `userMessage`, `agentMessage`
- `commandExecution`, `fileChange`
- `mcpToolCall`
- `enteredReviewMode`, `exitedReviewMode`
- `contextCompaction` 등

---

## 에러 처리는 turn failed와 error 이벤트를 같이 본다

턴이 실패하면 서버가 `error` 이벤트를 내보내고, turn은 `status: "failed"`로 끝납니다. (가능하면 upstream HTTP 상태코드도 포함)

문서에 나오는 대표 `codexErrorInfo` 예시는 `ContextWindowExceeded`, `UsageLimitExceeded`, `BadRequest`, `Unauthorized`, `SandboxError` 같은 것들이에요.

---

## 승인 흐름을 넣으면 제품 품질이 확 올라간다

Codex 설정에 따라 **명령 실행**이나 **파일 변경**은 승인이 필요할 수 있습니다. 이때 서버가 클라이언트에게 “서버가 먼저 시작하는 JSON-RPC 요청”을 보내고, 클라이언트가 승인/거절 결정을 응답합니다.

- 명령 실행 결정: `accept`, `acceptForSession`, `decline`, `cancel`, 또는 execpolicy amendment 형태
- 파일 변경 결정: `accept`, `acceptForSession`, `decline`, `cancel`

명령 실행 승인 메시지 순서는 문서에 이렇게 정리돼요.

1. `item/started`로 “승인 대기 commandExecution item” 표시
2. `item/commandExecution/requestApproval`로 승인 요청 도착
3. 클라이언트가 승인/거절 응답
4. `item/completed`로 최종 상태(completed/failed/declined) 확정

파일 변경 승인도 같은 패턴이고, 앱 커넥터(MCP tool call)에서도 부작용이 있으면 `tool/requestUserInput` 같은 방식으로 승인 UI가 뜰 수 있다고 설명돼요.

---

## 리뷰 기능은 제품에 넣기 좋은 하이라이트 기능

`review/start`는 “리뷰어”를 실행하고 리뷰 item을 스트리밍합니다. 타겟은 `uncommittedChanges`, `baseBranch`, `commit`, `custom` 등이 있어요.

- `delivery: "inline"`: 기존 thread에서 리뷰 실행
- `delivery: "detached"`: 새 리뷰 thread로 분리해서 실행(서버가 새 thread 시작 알림도 보냄)

리뷰 시작/종료는 `enteredReviewMode`, `exitedReviewMode` item으로 오고, 완료 이벤트(`item/completed`)의 최종 리뷰 텍스트를 UI에 렌더링하라고 안내합니다.

---

## 모델 목록과 기능 플래그는 UI 셀렉터 만들 때 필수

### model list

`model/list`는 모델 피커/옵션 UI를 만들 때 유용합니다. `includeHidden: true`로 숨김 모델까지 받아올 수 있고, 모델마다 reasoning effort 옵션, upgrade 권장 모델, input modalities(예: text/image), personality 지원 여부 같은 메타데이터가 있습니다.

또 오래된 모델 카탈로그에서 `inputModalities`가 없으면 `["text","image"]`로 취급하라고 문서가 안내해요.

### experimental feature list

`experimentalFeature/list`는 기능 플래그의 stage(`beta`, `stable`, `deprecated` 등)와 설명을 가져올 수 있어요.

---

## 스키마 생성으로 타입 안정성을 챙기기

클라이언트에서 메시지 타입을 안전하게 다루려면 스키마가 있으면 좋죠. 문서에 따르면 CLI로 **TypeScript 스키마**나 **JSON Schema 번들**을 생성할 수 있고, 실행한 Codex 버전에 맞춰 결과물이 생성됩니다.

```bash
codex app-server generate-ts --out ./schemas
codex app-server generate-json-schema --out ./schemas
```

---

## 체크리스트 최소 구현 순서

처음 붙일 때는 이 순서대로 하면 삽질이 확 줄어요.

1. stdio로 연결한다: 프로세스 실행 + stdin으로 JSONL 전송, stdout 라인 파싱
2. 연결되면 `initialize` → `initialized`를 **무조건** 먼저 한다
3. `thread/start`로 threadId 확보
4. `turn/start`로 실행하고, 이후부터는 notification을 계속 읽는다
5. UI는 `item/started`, `item/*/delta`, `item/completed`를 기준으로 갱신한다
6. 승인 요청이 오면(명령/파일) 승인 UI를 띄우고 결정 응답을 보낸다

---

원하면, 위 내용을 바탕으로 **“내 제품에서 바로 쓸 수 있는 샘플 클라이언트 뼈대(Typescript)”** 형태로도 정리해 드릴게요. (예: 요청 id 관리, notification 라우팅, item 상태 store 설계, approval 모달 처리까지)

[1]: https://developers.openai.com/codex/app-server/ "Codex App Server"
