---
title: Agent Runbook / Operating Manual — Design
status: approved
approval_basis: gstack self-review (독립 리뷰어 세션 없음 — Reviews 섹션에 근거 기록)
approvals:
  backend: self_reviewed
  frontend: self_reviewed
  security: self_reviewed
  designer: self_reviewed
required_approvals: [backend, frontend, security, designer]
---

# Design — Agent Runbook / Operating Manual (T06)

## 1. 아키텍처 위치

```text
seed.ts ─┐
         ├─→ SoulMapData ─→ buildRunbooks(agents, events, requests)
export ──┘        │                    │
   (Agent.runbook)│                    ├─ buildCapabilityReadiness()   (재사용)
                  │                    ├─ summarizeAgentActivity()     (재사용)
                  │                    └─ RunbookOverride merge        (신규)
                  └────────────────────────────→ AgentRunbookPanel (UI)
```

- 새 도메인 파일: `src/domain/runbook.ts` (순수 함수, throw 없음)
- 재사용: `capabilityReadiness.ts`(가능성/게이트), `activity.ts`(활동·리스크 신호)
- 코어 타입 변경 최소화: `Agent` 에 optional `runbook?: RunbookOverride` 한 필드만 추가

## 2. 도메인 계약

```ts
export type RunbookPosture = 'delegate' | 'supervise' | 'hold'

export type RunbookSectionKey =
  | 'delegateWhen'        // 추천 위임 상황
  | 'allowedActions'      // 승인 없이 가능
  | 'approvalRequired'    // 사람 승인 필요
  | 'forbiddenActions'    // 금지
  | 'constraints'         // 운영 제약
  | 'verification'        // 검증 체크리스트
  | 'stopConditions'      // 에스컬레이션 / 중단 조건

export interface RunbookItem {
  /** 섹션 내 안정적 키 (React key / 테스트 앵커) */
  id: string
  label: string
  /** 이 항목이 나온 파생 근거 — 하드코딩된 문구가 아님을 증명 */
  evidence: string
  /** export override에서 온 항목인지 */
  fromExport?: boolean
}

export interface AgentRunbook {
  agentId: string
  agentName: string
  emoji: string
  accent: string
  posture: RunbookPosture
  headline: string
  /** 'derived' | 'export' | 'merged' */
  provenance: RunbookProvenance
  delegateWhen: RunbookItem[]
  allowedActions: RunbookItem[]
  approvalRequired: RunbookItem[]
  forbiddenActions: RunbookItem[]
  constraints: RunbookItem[]
  verification: RunbookItem[]
  stopConditions: RunbookItem[]
}

export function buildRunbooks(agents, events, requests): AgentRunbook[]
export function buildAgentRunbook(agent, events, requests): AgentRunbook
export const RUNBOOK_SECTIONS: { key: RunbookSectionKey; label: string; tone: 'go'|'gate'|'stop'|'info' }[]
```

`RunbookOverride`(코어 타입, `src/types.ts`)는 7개 섹션 × `string[]` + `headline?`.

## 3. 파생 규칙 (하드코딩 셀 금지)

### 3.1 입력 신호

| 신호 | 출처 |
|---|---|
| capability status/score/reasons | `buildCapabilityReadiness` 셀 |
| 활동·검증·리스크 신호, 마지막 활동, 변경 파일 | `summarizeAgentActivity` |
| kind / status / trust / autonomy / coherence | `Agent` |
| specialty / description / soul.values / skill 이름·id | 텍스트 haystack (lowercase) |
| 수신/발신 요청 | `InterAgentRequest` |

### 3.2 승인 게이트 (핵심)

게이트는 "그 일을 할 능력이 있는가"에서 파생한다. 능력이 없으면 게이트도 만들지 않는다(지어내기 금지).

| 게이트 | 발동 조건 | 예상 대상(seed) |
|---|---|---|
| 메일 발송 (초안까지만 자동) | 텍스트에 `gmail/mail/메일/outlook/이메일/발송` | google-workspace, izera365, hermes-default |
| 외부 게시 / 소셜 발행 | 텍스트에 `게시/publish/tweet/트윗/social/소셜/telegram/텔레그램/x-twitter` | social-media, pistachio |
| n8n workflow mutation (activate/deactivate·production) | 텍스트에 `n8n/workflow/워크플로/자동화/automation/mcp` | n8n-mcp, hermes-default(=orchestration 아님, 텍스트 기준으로만) |
| GitHub push / release / 배포 | `code_build_test` readiness 가 idle 이 아님 | claude-code, hermes-default |
| destructive local ops (rm -rf, git reset --hard, force push, 대량 삭제) | `code_build_test` 또는 `workspace_ops` affinity | claude-code, google-workspace, doc-auto-agent … |
| production 데이터 쓰기 | `kind === 'integration'` | google-workspace, n8n-mcp |
| readiness `approval_gated` 셀 | Readiness Matrix가 게이트로 판정한 모든 capability | external_send affinity 보유 에이전트 |

fail-safe: 위 게이트 항목은 `allowedActions` 에 **중복 노출하지 않는다**(같은 capability가 gate면 allowed에서 제외).

### 3.3 나머지 섹션

| 섹션 | 규칙 |
|---|---|
| `delegateWhen` | readiness `ready` 셀 → "지금 바로 위임", `partial` 셀 → "검토 병행". 수신 요청(`toAgentId`)의 capability → "정례 요청 수신 중". 최대 5개 |
| `allowedActions` | readiness `ready`/`partial` 이며 게이트 대상이 아닌 capability. evidence = readiness reasons 첫 항목 |
| `forbiddenActions` | ① 게이트 대상 → "승인 없는 자동 실행 금지" ② readiness `blocked` → "지금 위임 금지" ③ 텍스트에 `읽기 전용/read-only/readonly` → "쓰기·변경 금지" ④ 텍스트에 `격리/분리/경계` → "계정·맥락 경계 초과 금지" ⑤ `status` dormant/planned → "미연결 상태 실행 위임 금지" ⑥ 변경 파일 신호가 있으면 → "시크릿/개인정보 원문을 로그·export에 남기기 금지" |
| `constraints` | trust/autonomy 조합, coherence < 80, `memory.recentGrowth === 0`, `kind === 'integration'`(오케스트레이터 경유), 마지막 활동 시각, 활동 리스크 신호 |
| `verification` | 보유 capability별 체크: code→`npm test -- --run`/`lint`/`build`, document→원문 보존·업로드 링크, automation→마지막 실행/실패 로그, workspace→대상·권한, observe→출처 링크, 게이트 보유→발송 전 수신자·본문·draft 확인. 공통 마지막 항목: Activity Blackbox 재확인 |
| `stopConditions` | 리스크 신호 재발, `blocked` capability 강행, dormant/planned 미연결, 게이트 승인 무응답, coherence<80 근거 불명확, 공통: 동일 작업 2회 연속 실패/timeout |

### 3.4 posture

```text
hold      ← status dormant|planned, 또는 ready/partial capability 0개
supervise ← 리스크 신호 있음, 또는 trust < 80, 또는 autonomy < 65, 또는 ready 0개
delegate  ← 그 외
```

### 3.5 export override 병합

| 섹션 | 병합 방식 |
|---|---|
| `approvalRequired`, `forbiddenActions` | **union** (파생 항목 유지 + export 항목 추가) — 안전장치 축소 불가 |
| 그 외 5개 섹션 | export 제공 시 **replace** |
| `headline` | export 제공 시 replace |

`provenance`: override 없음 → `derived`, 있으면 `merged`(안전 섹션은 항상 파생이 남기 때문에 `export` 단독은 없음… 단, 안전 섹션 파생이 0개이고 export만 있으면 `merged` 로 표기해 출처를 숨기지 않는다).

## 4. Import 계약

```jsonc
"profiles": [{
  "id": "default",
  "runbook": {
    "headline": "…",
    "delegateWhen": ["…"],
    "allowedActions": ["…"],
    "approvalRequired": ["…"],
    "forbiddenActions": ["…"],
    "constraints": ["…"],
    "verification": ["…"],
    "stopConditions": ["…"]
  }
}]
```

- 모든 필드 optional. 문자열이 아닌 값/배열 아님 → 무시(throw 금지).
- 빈 배열은 "제공했으나 비어 있음" = 해당 섹션 replace 대상에서 제외(파생 유지). 잘못된 export가 화면을 비우지 못하게 한다.

## 5. UI 설계 (`/design-consultation` 관점)

Agent Detail 내부에 전용 패널 추가 — 사용자가 별자리에서 에이전트를 선택하면 같은 detail column 안에서 정체성/활동 다음에 운영 규칙을 바로 확인한다.

```text
┌ Agent Runbook / Operating Manual ─────────────────────────┐
│ Runbook · 이 에이전트를 어떻게 쓰는가                      │
│ ⌨️ Claude Code Dev Cell   [위임 가능]   provenance: 파생   │
│ headline 한 줄                                             │
│ ── 게이트 요약 strip: 승인 3 · 금지 4 · 중단 조건 3 ──      │
│ ┌ go   추천 위임 상황 ┐ ┌ go   승인 없이 가능 ┐             │
│ ┌ gate 승인 필요 ⚠   ┐ ┌ stop 금지 ⛔        ┐             │
│ ┌ info 운영 제약     ┐ ┌ info 검증 체크리스트┐             │
│ ┌ stop 중단 조건     ┐                                     │
│ ── fleet strip: 다른 에이전트 승인 게이트 수 chips ──       │
└───────────────────────────────────────────────────────────┘
```

- 톤 컬러: `go`=green, `gate`=violet(readiness `approval_gated` 와 동일 색 언어), `stop`=red, `info`=muted. 기존 CSS 변수/색과 일관되게 재사용.
- 각 항목: `label` + `evidence`(작은 글씨). evidence가 "파생"임을 시각적으로 증명한다.
- 빈 섹션: `파생된 신호 없음` (지어내지 않음).
- 접근성: 섹션은 `<h4>` + `aria-label`, 패널은 `aria-label="Agent Runbook Operating Manual"`.

## 6. 테스트 매트릭스 (`/plan-eng-review` 관점)

| # | 대상 | 케이스 | 기대 |
|---|---|---|---|
| 1 | shape | 빈 입력 | 빈 배열, throw 없음 |
| 2 | shape | 에이전트 수 = runbook 수, 섹션 7개 존재 | 동일 |
| 3 | gate | mail 신호 에이전트 | `approvalRequired` 에 메일 발송 항목 |
| 4 | gate | n8n/workflow 신호 | workflow mutation 항목 |
| 5 | gate | code capability 보유 | GitHub push/release 항목 + destructive local ops 항목 |
| 6 | gate | 소셜 게시 신호 | 외부 게시 항목 |
| 7 | gate | 무관한 에이전트(브리핑만) | push/mail 게이트 **없음** (오탐 방지) |
| 8 | allowed | 게이트 대상 capability는 allowed에 없음 | 중복 금지 |
| 9 | forbidden | 읽기 전용 신호 | 쓰기/변경 금지 항목 |
| 10 | forbidden | dormant/planned | 실행 위임 금지 항목 |
| 11 | posture | 고신뢰·리스크 없음 | `delegate` |
| 12 | posture | 리스크 신호 | `supervise` |
| 13 | posture | planned | `hold` |
| 14 | constraints | coherence < 80 / recentGrowth 0 / integration | 각각 항목 존재 |
| 15 | verification | code capability | `npm test` 문구 포함 |
| 16 | stop | 리스크 신호 | 에스컬레이션 항목 |
| 17 | override | export replace 섹션 | delegateWhen이 export 값으로 대체, `fromExport` |
| 18 | override | **안전 섹션 축소 시도** | 파생 approval/forbidden 항목이 그대로 남음 (union) |
| 19 | override | 잘못된 타입/빈 배열 | 무시, 파생 유지, throw 없음 |
| 20 | adapter | `HermesExport.profiles[].runbook` | `Agent.runbook` 으로 전달, 비정상 값은 drop |
| 21 | seed 다양성 | seed 전체 | 최소 3개 이상의 서로 다른 approval 게이트 집합, 모두 동일하지 않음 |
| 22 | UI | 패널 렌더 | 7개 섹션 제목 표시 |
| 23 | UI | 에이전트 전환 | 선택 변경 시 항목이 실제로 달라짐 |
| 24 | UI | 게이트 표기 | Google Workspace 선택 시 메일 승인 문구 노출 |

## Reviews

독립 리뷰어 세션 없음 → 아래는 **gstack self-review** 기록.

### `/plan-eng-review` 관점

- **재계산 중복 리스크**: readiness를 다시 계산하면 두 패널이 어긋난다 → 입력으로 소비하도록 확정. `buildRunbooks` 는 readiness를 **한 번만** 계산해 전 에이전트에 공유(O(n) 유지).
- **성능**: 패널은 `useMemo`로 `[agents, events, requests]` 의존. 기존 패널과 동일 패턴.
- **타입 변경 파급**: `Agent.runbook` optional → 기존 seed/테스트 fixture 무변경. `tsc -b` 리스크 낮음.
- **테스트 매트릭스**: 위 24케이스. 특히 #7(오탐 방지)과 #18(안전장치 축소 불가)이 회귀 방지 핵심.

### `/cso` 관점

- import override가 `approvalRequired`/`forbiddenActions` 를 **줄일 수 없음**을 테스트 #18로 고정.
- 게이트 문구는 정책 표기일 뿐 실제 실행 경로가 없다 → 이번 사이클에서 외부 부작용 0.
- runbook 문자열은 export에서 올 수 있으므로 UI는 텍스트로만 렌더(HTML 주입 없음, React 기본 이스케이프).

### `/design-consultation` 관점

- 색 언어를 Readiness Matrix와 통일(gate=violet, blocked/stop=red, ready/go=green)해 학습 비용을 줄인다.
- 7섹션을 한 열로 쌓으면 스크롤이 길다 → 2열 그리드 + 톤별 테두리로 스캔 가능하게.
- evidence를 항상 붙여 "AI가 지어낸 규칙"이 아니라 "데이터에서 나온 규칙"으로 읽히게 한다.
