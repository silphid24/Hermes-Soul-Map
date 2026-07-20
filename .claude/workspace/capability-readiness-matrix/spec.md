---
title: Capability Readiness Matrix
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Capability Readiness Matrix (T04)

## 목표

Soul Map은 지금까지 "무슨 일을 했는가(Activity)", "누구인가(Identity Drift)", "어떻게 위임했는가(Delegation Replay)"를 보여줬다. 다음 질문은 **"그래서 지금 누구에게 무엇을 맡길 수 있는가?"** 이다.

`Capability Readiness Matrix`는 각 에이전트가 특정 **능력(capability)** 을 맡을 준비가 얼마나 됐는지를 파생 계산해 매트릭스로 보여준다. UI 셀 값은 **절대 하드코딩하지 않고** Agent / Skill / LogEvent / activity / risk / soul 신호에서 파생한다.

## 배경 / KB 조회 결과 (선행)

- `.claude/knowledge/agent-activity-blackbox.md`: 리스크 파싱 규칙(timeout / fail·error / changes_requested)과 "실행보다 관측" 방향. → 동일한 risk 규칙을 재사용한다.
- `.claude/knowledge/delegation-graph-replay.md`: 순수 함수 + 기존 타입 조합, 새 스키마 없이 파생. `'0 errors'` clean 신호가 risk 오탐이 되지 않도록 처리하는 규칙. → 재사용한다.
- `.claude/knowledge/soul-diff-identity-drift.md`: 신호가 없을 때 `unknown`/idle 로 정직하게 표현하는 관례. → readiness `idle` 에 반영.
- `src/types.ts`: `Agent`(kind/status/trust/autonomy/soul/memory/skills), `LogEvent`, `InterAgentRequest`가 이미 존재. **새 도메인 타입은 capabilityReadiness 전용 출력 타입만 추가**하고 코어 타입은 건드리지 않는다.
- `src/domain/activity.ts`: 이벤트 매칭(`agentId===id || source===id`), 검증/운영/risk 신호 추출 로직 재사용 가능.

## 능력 축 (Capability Axes)

```ts
type CapabilityKey =
  | 'observe_logs'      // 관측 · 로그 · 모니터링 · 트렌드 브리핑
  | 'document_minutes'  // 회의록 · 문서 · Notion 업로드
  | 'code_build_test'   // 코드 구현 · 빌드 · 테스트
  | 'automation_cron'   // cron · workflow · 자동화 파이프라인
  | 'workspace_ops'     // Drive/Sheets/Docs/Calendar/M365/Notion 파일 작업
  | 'external_send'     // 외부 발송 · 게시 · production mutation
```

## Readiness Status

```ts
type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'idle' | 'approval_gated'
```

- `ready` — 지금 맡길 수 있음 (강한 스킬/활동/신뢰 신호)
- `partial` — 부분적으로 가능 (신호는 있으나 약함)
- `blocked` — 능력은 있으나 막힘 (dormant/planned 상태 또는 risk 신호)
- `idle` — 해당 능력에 대한 신호 자체가 없음 (그 일을 하지 않음)
- `approval_gated` — 능력은 있으나 **사람 승인 게이트** 필요 (외부 발송/변경). 아무리 신뢰가 높아도 자동으로 `ready` 가 되지 않는다.

## Readiness Signals (파생 규칙)

각 (agent, capability) 쌍마다:

1. **Affinity** — 이 에이전트가 그 능력을 다루긴 하는가?
   - 관련 skill 이름/id 키워드 매칭 (+proficiency)
   - specialty / description / soul.values 텍스트 매칭
   - 관련 이벤트(summary 키워드 또는 관련 source) 활동
   - affinity 신호가 하나도 없으면 → `idle`
2. **Score (0–100)** — skill proficiency, 텍스트 매칭, 활동 건수, trust, autonomy, coherence, memory 성장으로 가중 합산.
3. **Damping**
   - `status ∈ {dormant, planned}` 이면 → `blocked` (준비돼 있어도 지금은 못 씀)
   - 해당 능력 이벤트에 risk 키워드(timeout/fail/error/changes_requested)가 있으면 → `blocked`
4. **Governance gate**
   - `external_send` 처럼 외부로 나가거나 production을 바꾸는 능력은, affinity가 있으면 → `approval_gated` (승인 게이트가 최우선 governance 신호)

우선순위: `idle` → (status damping) → `approval_gated` → (risk damping) → score 임계값(`ready ≥ 68`, `partial ≥ 42`, else `blocked`).

## 출력 계약

```ts
interface CapabilityReadinessCell {
  agentId: string
  agentName: string
  capability: CapabilityKey
  status: ReadinessStatus
  score: number        // 0–100
  reasons: string[]    // 파생 근거 (사람이 읽는 짧은 신호)
}

interface CapabilityReadinessMatrix {
  capabilities: CapabilityKey[]  // 고정 순서
  agents: string[]               // 입력 순서 agentId
  cells: CapabilityReadinessCell[]  // agent-major, capability 순
  topReady: CapabilityReadinessCell[]  // ready 셀 score 내림차순
  gated: CapabilityReadinessCell[]     // approval_gated 셀
}
```

## 검증 가능성 (QA 관점)

- 순수 함수 `buildCapabilityReadiness(agents, events, requests)` — 동일 입력 → 동일 출력(결정론).
- TDD 슬라이스:
  1. Claude Code(tool) → `code_build_test` = `ready`
  2. Google Workspace / n8n(integration) → `external_send` = `approval_gated`
  3. Doc Auto Agent(specialist) → `document_minutes` = `ready`/`partial`
  4. dormant/planned/risk-heavy → `ready` 아님
  5. affinity 없는 능력 → `idle`
- seed에서 서로 다른 agent class(default/specialist/tool/integration)가 시각적으로 다른 매트릭스를 만든다.

## 보안 관점 (security review)

- 외부 발송/ production mutation 은 반드시 `approval_gated` 로만 표현하고, 높은 trust/autonomy 로도 `ready` 로 승격되지 않는다. (governance gate가 score를 무시하고 우선)
- 파생 함수는 읽기 전용 — 어떤 외부 호출/발송도 하지 않는다. 순수 계산.

## Reviews

- **designer (approved):** capability × agent 매트릭스는 정보구조상 명확. status 5종을 색/라벨로 구분하고, idle은 시각적으로 약하게. topReady/gated 요약 스트립으로 "지금 맡길 수 있는 것"을 먼저 보이게 할 것.
- **security (approved):** external_send가 score와 무관하게 approval_gated 로 고정되는 규칙이 핵심. 파생 함수 read-only 확인. 승인.
- **qa (approved):** 5개 status가 모두 seed에서 관측되는지, 결정론적인지 테스트로 고정할 것. 승인.
