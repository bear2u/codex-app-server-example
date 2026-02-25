# Web UI Enhancement Checklist

이 문서는 `web-ui` 보강 작업의 기준 문서입니다.  
모든 수정은 아래 체크리스트 순서대로 진행하고, 각 항목의 완료 기준을 충족한 뒤 체크합니다.

기준일: `2026-02-24`

## 실행 규칙

- 체크 표시(`- [x]`)는 코드 반영 + 테스트/검증 완료 후에만 변경합니다.
- 항목별로 PR/커밋 단위를 분리합니다.
- 우선순위는 `P0 > P1 > P2` 입니다.

## 전체 체크리스트

- [x] `#01` (`P0`) 스트리밍 메시지의 thread 오염 방지
- [x] `#02` (`P0`) 코드 하이라이트 렌더링 성능 개선
- [x] `#03` (`P0`) SSE 재연결/복구 신뢰성 강화
- [x] `#04` (`P1`) 메시지 리스트 가상화(virtualization)
- [x] `#05` (`P1`) 접근성 보강(`aria-live`, `role="log"`, 상태 announce)
- [x] `#06` (`P1`) 이미지 첨부 메모리 최적화(리사이즈/압축)
- [x] `#07` (`P1`) API 요청 안정성 강화(timeout/retry/abort)
- [x] `#08` (`P1`) thread 단위 진행 상태 분리
- [x] `#09` (`P2`) 모바일 키보드/safe-area 대응 보강
- [x] `#10` (`P2`) 테스트 보강(컴포넌트/E2E)

## 현재 점검 결과 (`2026-02-25`)

완료 기준(각 항목의 "완료 기준")으로 판정했을 때, `#01~#10` 반영 완료 상태입니다.

최근 반영:

- [x] 채팅 입력 영역 `Model` 선택 UI 추가 및 `turn/start` payload 연동
- [x] 모델 목록 로딩(`GET /v1/models`) 및 선택 모델 로컬 저장(localStorage)
- [x] 우측 `Runtime Logs` 패널 추가 (`On/Off`, `Clear`, SSE/UI/Network 이벤트 표시)
- [x] SSE heartbeat 이벤트 + 재연결 backoff + `lastEventId` 복구 경로 추가
- [x] `react-virtuoso` 기반 메시지 가상화 적용

## 항목 상세

### #01 P0 스트리밍 메시지 thread 오염 방지

대상 파일:

- `web-ui/lib/event-reducer.ts`
- `packages/shared-contracts/src/events.ts`
- 필요 시 `codex-app-server/src/rpc/notification-router.ts`

작업:

- `agent.delta` 처리 시 `currentThreadId` 의존 로직 제거
- item/thread 매핑 키를 상태에 저장하고 해당 thread에만 append
- 이벤트 payload에 `threadId`가 없다면 계약 확장 또는 보완 매핑 추가

완료 기준:

- thread A 응답 스트리밍 중 thread B로 전환해도 A 응답이 B에 붙지 않음
- reducer 테스트 추가/통과

### #02 P0 코드 하이라이트 렌더링 성능 개선

대상 파일:

- `web-ui/components/code-block.tsx`
- `web-ui/components/message-rich-text.tsx`

작업:

- Shiki 초기화/렌더 빈도 최소화
- 긴 대화에서 불필요한 재하이라이트 방지(메모이제이션/캐시)
- 필요 시 lazy loading 또는 worker/off-main-thread 전략 검토

완료 기준:

- 긴 스레드에서 스크롤/입력 중 UI 끊김 체감 감소
- 기존 copy 기능/테마 표시 유지

### #03 P0 SSE 재연결/복구 신뢰성 강화

대상 파일:

- `web-ui/lib/sse-client.ts`
- `web-ui/components/chat-shell.tsx`

작업:

- SSE 끊김 감지 및 backoff 재연결 정책 명확화
- `Last-Event-ID` 기반 유실 이벤트 복구 경로 설계/반영
- heartbeat timeout 판단 로직 보강

완료 기준:

- 백엔드 재시작 후 자동 재연결
- 재연결 후 turn 상태/메시지 일관성 유지

### #04 P1 메시지 리스트 가상화

대상 파일:

- `web-ui/components/message-list.tsx`

작업:

- 메시지 대량 누적 시 렌더 개수 제한(virtual list)
- 상단 "더 불러오기" UX와 가상 스크롤 충돌 제거

완료 기준:

- 메시지 수가 커져도 스크롤 성능 저하가 크지 않음
- 기존 페이징 UX 유지

### #05 P1 접근성 보강

대상 파일:

- `web-ui/components/message-list.tsx`
- `web-ui/components/chat-shell.tsx`
- `web-ui/components/prompt-composer.tsx`

작업:

- 메시지 영역 `role="log"` + `aria-live` 적용
- 연결/오류/복사 상태를 스크린리더가 읽을 수 있게 보강
- 키보드 포커스 흐름 재점검

완료 기준:

- 스크린리더에서 상태 변화가 의미 있게 전달됨
- 키보드만으로 핵심 작업(스레드 선택/전송/중단) 가능

### #06 P1 이미지 첨부 메모리 최적화

대상 파일:

- `web-ui/components/prompt-composer.tsx`
- 필요 시 `web-ui/lib/*`

작업:

- 원본 base64 직접 적재 대신 리사이즈/압축 경로 추가
- 첨부 개수/크기 제한 메시지 명확화
- 전송 완료/취소 시 메모리 정리 경로 점검

완료 기준:

- 다중 이미지 첨부 시 메모리 급증 완화
- 기존 다중 첨부 UX 유지

### #07 P1 API 요청 안정성 강화

대상 파일:

- `web-ui/lib/api-client.ts`

작업:

- `AbortController` 기반 timeout 추가
- 재시도 가능한 오류(일시 네트워크/5xx) 제한적 retry
- 사용자 노출 에러 메시지 표준화

완료 기준:

- 일시 장애에서 즉시 실패 대신 복구 시도
- 오류 메시지가 원인 파악에 충분함

### #08 P1 thread 단위 진행 상태 분리

대상 파일:

- `web-ui/components/chat-shell.tsx`
- `web-ui/lib/event-reducer.ts`

작업:

- 전역 `isThinking` 의존을 thread 단위 상태로 분리
- 활성 thread 외 입력 제약 정책 명확화

완료 기준:

- 한 thread의 turn 진행 중에도 다른 thread 조회/동작이 자연스러움
- Stop 버튼 활성 조건이 실제 active turn과 일치

### #09 P2 모바일 키보드/safe-area 보강

대상 파일:

- `web-ui/components/chat-shell.tsx`
- `web-ui/components/prompt-composer.tsx`
- `web-ui/app/globals.css`

작업:

- iOS/Android 키보드 등장 시 입력창 가림 최소화
- `safe-area-inset-bottom` 반영
- 좁은 폭에서 버튼/입력 요소 겹침 제거

완료 기준:

- 모바일에서 입력창/전송 버튼 접근성 유지
- 헤더 접힘/펼침 상태와 충돌 없음

### #10 P2 테스트 보강(컴포넌트/E2E)

대상 파일:

- `web-ui/tests/*`
- 필요 시 e2e 디렉토리 신설

작업:

- reducer 테스트 확장(thread 오염 방지, 상태 분리)
- 메시지 리스트 페이징/더 불러오기 동작 테스트
- 모바일 헤더 접힘 상태 회귀 테스트

완료 기준:

- 핵심 회귀 시나리오가 자동 테스트로 커버됨
- CI에서 재현 가능

## 적용 순서 제안

1. `#01` -> `#02` -> `#03`
2. `#04` -> `#05` -> `#06` -> `#07` -> `#08`
3. `#09` -> `#10`
