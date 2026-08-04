---
title: Request Protocol Execution Layer — Design
status: approved
approval_basis: gstack self-review (`/plan-eng-review` + `/cso` 관점, 독립 리뷰어 세션 없음)
approvals:
  backend: self_reviewed
  frontend: self_reviewed
  security: self_reviewed
  designer: self_reviewed
required_approvals: [backend, frontend, security, designer]
---

# Design — Request Protocol Execution Layer (T07)

## 1. Architecture

```
                 ┌──────────────────────────────────────────┐
                 │ src/domain/requestExecution.ts (신규)     │
                 │  순수 함수 · IO 없음 · throw 없음          │
                 └──────────────────────────────────────────┘
                        ▲                    │
   consume (재계산 금지) │                    │ produce
                        │                    ▼
  ┌────────────────────┴───────┐   ┌──────────────────────────┐
  │ domain/runbook.ts          │   │ ExecutionAuditEntry[]     │
  │  buildAgentRunbook()       │   └──────────────────────────┘
  │   .approvalRequired[]      │                │
  └────────────────────────────┘                │ auditToLogEvents()
             ▲                                  ▼
  ┌──────────┴─────────────────┐   ┌──────────────────────────┐
  │ domain/capabilityReadiness │   │ LogEvent[] (type=handoff) │
  └────────────────────────────┘   └──────────────────────────┘
                                              │
                        ┌─────────────────────┼────────────────────┐
                        ▼                     ▼                    ▼
              summarizeAgentActivity  buildDelegationReplay   filterEvents
              (Activity Blackbox)     (Replay / status)       (Timeline)
```

핵심 결정 3가지:

1. **게이트를 재발명하지 않는다.** 승인 판정 = `buildAgentRunbook(targetAgent).approvalRequired` ∪ action 위험도 규칙. Runbook이 이미 Readiness의 `approval_gated` 를 승계하므로 세 계층이 자동으로 일관된다.
2. **실행 결과는 파생이지 난수가 아니다.** simulated 결과(`executed|failed|timeout`)는 요청 경로에서 관측된 risk 신호에서 나온다. 난수는 결정론(NFR-2)을 깨고 "지어내기 금지" 원칙에 위배된다.
3. **audit → LogEvent 한 방향 어댑터.** 기존 4개 패널을 건드리지 않고 audit이 흘러 들어간다. `type: 'handoff'` 라야 Delegation Replay가 step으로 받는다.

## 2. 도메인 계약

```ts
export type ExecutionTarget =
  | 'hermes' | 'claude-code' | 'n8n' | 'google-workspace' | 'github' | 'local' | 'manual'

export type ExecutionAction =
  | 'observe' | 'draft' | 'mutate' | 'publish' | 'code_change' | 'destructive' | 'workflow_mutation'

export type ExecutionRisk = 'low' | 'elevated' | 'high'
export type ExecutionMode = 'dry_run' | 'simulated'
export type ExecutionStatus = 'preview' | 'blocked_approval' | 'executed' | 'failed' | 'timeout'

export interface ExecutionGate { id: string; label: string; evidence: string }

export interface ExecutionPlan {
  requestId: string
  fromAgentId: string; fromAgentName: string
  toAgentId: string;   toAgentName: string
  target: ExecutionTarget
  targetEvidence: string
  action: ExecutionAction
  actionEvidence: string
  risk: ExecutionRisk
  approvalRequired: boolean
  gates: ExecutionGate[]
  /** dry-run에서 보여줄 "실행 시 남을 audit event" */
  expectedAuditEvents: string[]
  /** 승인이 통과됐다고 가정했을 때의 예상 결과 */
  projectedOutcome: 'executed' | 'failed' | 'timeout'
  outcomeEvidence: string
}

export interface ExecutionAuditEntry {
  id: string            // exec-<mode>-<requestId>-<sequence>
  requestId: string
  fromAgentId: string
  toAgentId: string
  target: ExecutionTarget
  action: ExecutionAction
  mode: ExecutionMode
  status: ExecutionStatus
  reason: string
  createdAt: string     // ISO 8601 (주입)
  approvalRequired: boolean
  approved: boolean
  risk: boolean
}
```

Public API:

| 함수 | 역할 | 순수성 |
|---|---|---|
| `planRequestExecution(request, ctx)` | target/action/risk/게이트/예상결과 파생 | pure |
| `dryRunRequest(request, ctx, opts)` | `mode:'dry_run'`, `status:'preview'` audit entry | pure |
| `executeRequest(request, ctx, opts)` | `mode:'simulated'` audit entry. 게이트 재검사 후 차단/실행 | pure |
| `auditToLogEvents(entries, agents)` | audit → `LogEvent[]` (`type:'handoff'`) | pure |
| `summarizeExecutionAudit(entries)` | 카운터(총/차단/실행/리스크) | pure |

`ctx = { agents, events, requests }`. `opts = { now: string, sequence: number, approved?: boolean }` — 현재시각/시퀀스는 **주입**한다(결정론).

## 3. Data flow

```
InterAgentRequest ─┐
Agent[]            ├─► planRequestExecution ─► ExecutionPlan
LogEvent[]         ┘         │  │  │
                             │  │  └─ approvalRequired  ← runbook.approvalRequired ∪ ACTION_GATES
                             │  └──── action            ← capability/summary 키워드 (+ target 기본값)
                             └─────── target            ← 요청 텍스트 > 대상 에이전트 신호

ExecutionPlan + opts ─► dryRunRequest    ─► audit(preview)
                     └─ executeRequest   ─► audit(blocked_approval | executed | failed | timeout)

audit[] ─► auditToLogEvents ─► LogEvent[](handoff)
                                 ├─► activityEvents  → Activity Blackbox / Timeline
                                 └─► replayEvents    → Delegation Graph Replay (risk → status '막힘')
```

### 3.1 Target 해석 (우선순위 순, 첫 매치 승)

| # | 조건 | target |
|---|---|---|
| 1 | 요청 텍스트에 `github/push/release/pr/배포/deploy` | `github` |
| 2 | 요청 텍스트 또는 대상 에이전트에 `n8n/workflow/워크플로` | `n8n` |
| 3 | 대상 에이전트에 `google/gmail/drive/calendar/workspace/docs/sheets` | `google-workspace` |
| 4 | 대상 에이전트가 dev 도구(`claude code/codex/kind==='tool'`) | `claude-code` |
| 5 | 대상 에이전트 status `planned`/`dormant` 또는 kind `future` | `manual` |
| 6 | 요청 텍스트에 로컬 파일/스크립트 신호(`파일/file/script/스크립트/로컬/local/rm `) | `local` |
| 7 | 그 외 Hermes 프로필 계열(`default`/`specialist`/`integration`) | `hermes` |
| 8 | fallback | `manual` |

> 미연결/미상은 `manual` 로 떨어뜨린다 = "사람이 직접 해야 함". fail-safe 방향(안전 규칙 3).

### 3.2 Action 분류 (우선순위 순, 높은 위험 우선)

| # | 신호 | action | risk |
|---|---|---|---|
| 1 | `삭제/delete/rm -rf/reset --hard/force push/drop/초기화/wipe` | `destructive` | high |
| 2 | `workflow/워크플로/n8n/activate/deactivate/파이프라인/pipeline` | `workflow_mutation` | high |
| 3 | `발송/게시/publish/send/mail/메일/tweet/트윗/sns/broadcast/공유` | `publish` | high |
| 4 | `생성/create/update/수정/등록/write/업로드/upload/mutation/변경` | `mutate` | high |
| 5 | `코드/code/구현/implement/refactor/리팩터/build/빌드/test/테스트/commit/patch/lint` | `code_change` | elevated |
| 6 | target 이 `claude-code` 또는 `github` 인데 위에 안 걸림 | `code_change` | elevated |
| 7 | `draft/초안/작성/요약/summarize/minutes/회의록/브리핑/brief/report/보고서` | `draft` | low |
| 8 | fallback | `observe` | low |

read-only 신호(`읽기 전용/read-only/readonly`)가 있고 분류 결과가 `draft`/`observe` 면 `observe` 로 낮춘다(관측 전용 요청을 초안 작성으로 과대 표기하지 않기 위함). **위험한 action은 절대 낮추지 않는다.**

### 3.3 승인 판정

```
approvalRequired = ACTION_GATED.has(action)              // mutate|publish|destructive|workflow_mutation
                 || target === 'github'                  // push/release는 항상 게이트
                 || runbookGates.length > 0 && actionTouchesGate
```

정확히는 게이트 목록을 만들고 비어 있지 않으면 승인 필요로 본다.

| 게이트 소스 | id | 발동 조건 |
|---|---|---|
| action 위험도 | `gate:action:<action>` | action ∈ {mutate, publish, destructive, workflow_mutation} |
| target github | `gate:target:github` | target === 'github' |
| Runbook | `gate:runbook:<runbookItemId>` | 대상 에이전트 Runbook의 `approvalRequired` 항목 중 **이번 action과 관련된 것** |

Runbook 항목 ↔ action 매핑(관련 없는 게이트를 전부 끌어와 모든 요청을 게이트하지 않기 위함):

| Runbook gate id | 관련 action |
|---|---|
| `gate:mail`, `gate:publish` | `publish` |
| `gate:workflow`, `gate:automation` | `workflow_mutation`, `mutate` |
| `gate:code_push` | `code_change`(target `github` 일 때), `destructive` |
| `gate:destructive` | `destructive` |
| `gate:integration_write` | `mutate`, `publish`, `workflow_mutation` |
| `gate:cap:external_send` | `publish`, `mutate` |
| 그 외 `gate:cap:*` | 매핑 없음(정보성) |

> **주의(자기 검토에서 잡은 함정):** `claude-code` 의 로컬 `code_change` 는 게이트되지 않아야 한다. T06 Runbook도 코드/빌드/테스트는 `allowedActions`, GitHub push·destructive만 게이트한다. `gate:code_push` 를 `code_change` 전체에 매핑하면 로컬 구현 요청까지 막혀 Runbook과 모순된다 → **target이 `github` 일 때만** 매핑한다.

### 3.4 결과 투영 (deterministic)

```
pathRiskEvents(request) = events.filter(e =>
     detectRisk(e.summary) && (
        matchesAgent(e, targetAgent)                              // 대상 자신의 리스크
     || (matchesAgent(e, fromAgent) && mentions(e.summary, target)) // 경로상 리스크
     ))
```

- `timeout|timed out` 포함 → `projectedOutcome = 'timeout'`
- 그 외 risk 신호 존재 → `'failed'`
- 대상 에이전트 status `dormant|planned` → `'failed'` (미연결)
- 그 외 → `'executed'`

risk 파싱은 `activity.ts` / `delegationReplay.ts` 와 **동일 규칙**(`0 errors` 제거 후 키워드)을 쓴다.

## 4. State transitions

요청 실행 상태 머신 (요청의 `RequestStatus` 와는 별개 축):

```
                     ┌──────────────┐
   dryRunRequest ───►│   preview    │  (mode=dry_run, 부작용 없음, 항상 허용)
                     └──────────────┘

   executeRequest
     ├─ approvalRequired && !approved ──► blocked_approval   (실행되지 않음, 기록은 남음)
     └─ else ──► projectedOutcome
                    ├─ executed   (risk=false)
                    ├─ failed     (risk=true)
                    └─ timeout    (risk=true)
```

불변식:

- **I1.** `preview` 는 어떤 경우에도 실행으로 승격되지 않는다. dry-run은 별도 호출.
- **I2.** `blocked_approval` 은 `approvalRequired === true && approved === false` 일 때만 나온다. 역도 성립(게이트인데 미승인이면 반드시 차단).
- **I3.** 모든 호출은 정확히 1건의 audit entry를 만든다 — 차단도 기록된다.
- **I4.** `executeRequest` 는 입력 `request` 객체를 변경하지 않는다(동결 검사 테스트).
- **I5.** `risk === true` ⟺ `status ∈ {failed, timeout}`.

요청 자체의 `RequestStatus` 전이(`queued→accepted→…`)는 기존 `domain/requests.ts` 소관이며 이번 계층은 **건드리지 않는다**(관심사 분리).

## 5. UI 설계

위치: dashboard grid에서 `RequestLab` 바로 다음, `DelegationReplayPanel` 앞.

```
┌ Request Execution Protocol ─────────────────────────────┐
│ Inter-Agent Protocol · 실행 프로토콜                      │
│ ⚠ 이 패널은 외부 호출을 하지 않습니다. dry-run/simulated 전용 │
│                                                          │
│ [요청 선택 chips: req-dev | req-social | req-doc-auto …]   │
│                                                          │
│ ┌ plan ────────────────────────────────────────────────┐ │
│ │ target: claude-code   action: code_change  risk: 높음  │ │
│ │ 근거: …                                                │ │
│ │ 🔒 승인 필요 2건  ← approval marker                     │ │
│ │  · 외부 게시/발송 — 공개 전 사람 승인 (메일 신호 'gmail') │ │
│ │ 예상 audit event: exec … / handoff LogEvent …          │ │
│ └──────────────────────────────────────────────────────┘ │
│ [Dry-run preview]  ☐ 사람 승인됨  [Simulated 실행]         │
│                                                          │
│ Audit log (총 3 · 차단 1 · 리스크 1)                       │
│  exec-simulated-req-social-2 · 차단됨 · publish · …       │
└──────────────────────────────────────────────────────────┘
```

- 승인 체크박스는 게이트가 있을 때만 활성. 라벨에 "로컬 선언이며 인증이 아님" 명시.
- 상태 색: `preview` 중립 / `blocked_approval` violet(게이트와 동일 톤) / `executed` green / `failed`·`timeout` red.
- 기존 디자인 토큰 재사용: `.panel`, `.section-heading`, `.chip-btn`, `.empty-state`, readiness 상태 색 클래스와 톤 일치.

접근성:

- `<section aria-label="Request Execution Protocol">` → `getByRole('region')`
- 승인 마커는 아이콘이 아니라 텍스트("승인 필요")로도 읽힌다.
- 요청 선택은 실제 `<button>` (키보드 접근 가능).

## 6. Test matrix

### 6.1 도메인 (`src/domain/requestExecution.test.ts`)

| # | 대상 | 케이스 | 기대 |
|---|---|---|---|
| D1 | target | 대상=Claude Code Dev Cell | `claude-code` |
| D2 | target | 대상=Google Workspace API | `google-workspace` |
| D3 | target | 대상=n8n MCP | `n8n` |
| D4 | target | capability에 `github.push` | `github` |
| D5 | target | 대상 status `planned` | `manual` |
| D6 | target | 대상=Hermes 프로필 specialist | `hermes` |
| D7 | action | `mail.send` / 발송 | `publish` + high |
| D8 | action | `workflow.activate` | `workflow_mutation` |
| D9 | action | `repo.delete` / rm -rf | `destructive` |
| D10 | action | claude-code 대상 일반 요청 | `code_change` |
| D11 | action | `읽기 전용` 브리핑 | `observe` |
| D12 | approval | publish/mutate/workflow/destructive/github → 필수 | `approvalRequired === true` |
| D13 | approval | claude-code 로컬 `code_change` → 불필요 | `false` (Runbook `allowedActions` 와 일관) |
| D14 | approval | Google Workspace mail 요청 게이트 근거에 Runbook 항목 포함 | gates에 `gate:runbook:` 존재 |
| D15 | dry-run | mode/status/부작용 없음 | `dry_run`/`preview`, 입력 불변 |
| D16 | dry-run | 예상 audit event 목록 비어있지 않음 | `expectedAuditEvents.length > 0` |
| D17 | execute | 게이트 + 미승인 | `blocked_approval`, risk=false |
| D18 | execute | 게이트 + 승인 | `executed` |
| D19 | execute | 비게이트 | `executed` (승인 없이) |
| D20 | execute | 경로 timeout 신호 | `timeout`, risk=true |
| D21 | execute | 대상 dormant | `failed`, risk=true |
| D22 | audit | 필드 8종 모두 존재 | id/requestId/target/action/mode/status/reason/createdAt |
| D23 | LogEvent | `type==='handoff'`, timeout summary | replay가 risk step으로 인식 |
| D24 | replay 통합 | timeout audit 주입 → `buildDelegationReplay().status` | `'blocked'`, riskCount 증가 |
| D25 | 결정론 | 동일 입력 2회 | deep equal |
| D26 | seed 다양성 | seed 5개 요청 | target 종류 ≥ 3 |
| D27 | 순수성 | 모듈에 외부 IO 없음 | 소스에 `fetch(`/`XMLHttpRequest`/`child_process` 없음 |

### 6.2 UI visible contract (`src/App.execution.test.tsx`)

| # | 케이스 | 기대 |
|---|---|---|
| U1 | 패널 렌더 | `region` "Request Execution Protocol" 존재 |
| U2 | 외부 호출 없음 고지 | "외부 호출" 문구 표시 |
| U3 | dry-run 클릭 | audit log에 `dry_run`/`preview` 행 추가 |
| U4 | 게이트 요청 선택 | "승인 필요" 마커 표시 |
| U5 | 미승인 실행 | `차단됨` 행 추가, `실행됨` 아님 |
| U6 | 승인 후 실행 | `실행됨` 행 추가 |
| U7 | agent class 차이 | 요청 전환 시 target/action 라벨이 실제로 달라짐 |
| U8 | timeout 요청 실행 | 리스크 표기 + Delegation Replay 상태 `막힘` |

## 7. 리스크 / 완화

| 리스크 | 완화 |
|---|---|
| 실제 실행처럼 오인 | 패널 고지 + audit `mode` 항상 표기 + 테스트 U2/U3 |
| 게이트 우회 | 도메인에서 재검사(I2), UI 버튼과 무관하게 차단. 테스트 D17 |
| Runbook과 모순된 게이트 | Runbook 출력을 소비 + action 매핑 표(3.3). 테스트 D13 |
| 난수로 인한 flaky 테스트 | 결과 투영을 관측 신호에서 파생(3.4). `now`/`sequence` 주입. 테스트 D25 |
| audit 폭주로 Blackbox 오염 | audit LogEvent는 명시적 실행 시에만 생성(자동 생성 없음), 메모리 한정 |

## 8. 구현 순서 (TDD 슬라이스)

1. RED: D1–D6 target → GREEN 최소 구현
2. RED: D7–D11 action → GREEN
3. RED: D12–D14 승인 판정(Runbook 소비) → GREEN
4. RED: D15–D19 dry-run/execute 상태 머신 → GREEN
5. RED: D20–D21 결과 투영 → GREEN
6. RED: D22–D24 audit → LogEvent → replay 반영 → GREEN
7. RED: U1–U8 UI → GREEN (패널 + App 배선 + CSS)
8. 문서/검증
