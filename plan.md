# Hermes Agent Soul Map — Product Development Plan

> **For Claude Code / Hermes:** 이 문서를 프로젝트의 상위 제품 방향으로 사용한다. 실제 작업 단위는 `task.md`에서 관리한다. 새 기능 개발 전에는 반드시 `plan.md` → `task.md` → `.claude/knowledge/` → 관련 기존 코드 순서로 읽는다.

## 0. North Star

**Hermes Agent Soul Map은 단순 로그 뷰어가 아니라, 동한이 사용하는 AI 에이전트 운영체제의 “관찰·기억·판단·위임·준비도” 계층을 시각화하는 Agent Identity Platform이다.**

핵심 원칙:

1. **실행 버튼보다 관측 계층 우선** — Claude Code를 UI에서 직접 실행시키기보다, 에이전트가 무엇을 했고 어떤 정체성/능력/위임 상태인지 먼저 보이게 한다.
2. **Seed에서도 살아있게** — 실제 live backend가 없어도 각 에이전트 카드가 의미 있는 차이를 보여야 한다.
3. **Import 계약 중심** — 브라우저 UI는 `HermesExport` JSON을 받아 파생 계산한다. 실제 Hermes 파일 직접 접근은 export generator/bridge가 담당한다.
4. **TDD + visible contract** — 도메인 함수 테스트뿐 아니라 types/import/seed/UI까지 눈에 보이는 계약 경로를 검증한다.
5. **Claude Code는 개발 셀** — 복잡한 기능 구현은 Claude Code에 위임하되, Hermes가 최종 검증(`npm test`, `lint`, `build`, preview health)을 확인한다.

## 1. Recommended Direction from Ideation

| 순서 | 기능 | 제품 가치 | 상태 |
|---:|---|---|---|
| 1 | Agent Activity Blackbox | 실행 버튼 없이도 “에이전트가 무슨 일을 했는지” 살아있게 보임 | ✅ Done |
| 2 | Soul Diff / Identity Drift | 이 프로젝트만의 독창성. 단순 로그뷰어를 넘어 정체성 변화 추적 | ✅ Done |
| 3 | Delegation Graph Replay | 에이전트 간 요청/위임 흐름 시각화. 제품성 높음 | ✅ Done |
| 4 | Capability Readiness Matrix | 지금 어떤 에이전트가 무엇을 할 수 있고 얼마나 준비됐는지 명확화 | ✅ Done |
| 5 | Live Hermes Export Bridge | 실제 Hermes 데이터 자동 반영. 정적 seed → 살아있는 운영체제로 전환 | ✅ Generator Done / Bridge Planned |
| 6 | Agent Runbook / Operating Manual | 각 에이전트별 사용법·제약·승인 게이트·권한 명시 | ✅ Done |
| 7 | Request Protocol Execution | mock request queue를 실제 Hermes/Claude/n8n 호출과 연결 | ⏳ Planned |
| 8 | Design Polish + Shareable Narrative | 외부 공유 가능한 제품 데모 수준으로 story/visual polish | ⏳ Planned |

## 2. Current Completed Layers

### 2.1 Agent Activity Blackbox

- 위치: Agent Detail 안의 `Agent Activity Blackbox`
- 도메인: `src/domain/activity.ts`
- 역할:
  - 최근 이벤트 수
  - 마지막 활동
  - 변경 파일
  - validation/operation/risk signal
  - 최근 summary
- 중요한 결정:
  - Claude Code뿐 아니라 cron/handoff/memory/skill/decision 기반 비개발 에이전트도 활동 신호를 보여야 한다.

### 2.2 Soul Diff / Identity Drift

- 위치: Agent Detail 안의 `Soul Diff / Identity Drift`
- 도메인: `src/domain/identityDrift.ts`
- 역할:
  - autonomy/memory/skill/level delta
  - identity/tone/mood/values/coherence 변화
  - baseline soul snapshot 대비 현재 soul 변화
- 중요한 결정:
  - `SoulSnapshot`과 `soulHistory`는 v3 import 계약으로 유지한다.

### 2.3 Delegation Graph Replay

- 위치: Dashboard grid의 `Delegation Graph Replay`
- 도메인: `src/domain/delegationReplay.ts`
- 역할:
  - request + handoff event를 replay step으로 변환
  - agent 간 edge 집계
  - latest path, risk count, flow status 표시
- 중요한 결정:
  - 요청 큐는 현재 상태, replay는 누적 흐름이다.

## 3. Completed Build Target — Capability Readiness Matrix

### Goal

각 에이전트가 현재 **무엇을 할 수 있고, 그 능력이 얼마나 준비됐는지**를 matrix로 표시한다.

### Why It Was Built

앞선 1~3번은 활동/정체성/위임을 보여준다. 다음은 “그래서 지금 누구에게 무엇을 맡길 수 있는가?”를 답해야 한다.

### Expected UX

Dashboard에 `Capability Readiness Matrix` 섹션 추가:

| Capability | Hermes | izera365 | Doc Auto | Claude Code | Google Workspace | n8n |
|---|---:|---:|---:|---:|---:|---:|
| observe/logs | Ready | Partial | Ready | Ready | Partial | Partial |
| document/minutes | Partial | Ready | Ready | Idle | Ready | Partial |
| code/build/test | Partial | Idle | Idle | Ready | Idle | Idle |
| automation/cron | Ready | Ready | Ready | Partial | Partial | Ready |
| external-send | Approval gated | Approval gated | Idle | Idle | Approval gated | Approval gated |

### Readiness Signals

Readiness should be **derived**, not hand-written per UI cell:

- skills and proficiency
- agent kind/status
- trust/autonomy/coherence
- memory longTerm/recentGrowth
- event/activity signals
- risk signals
- source/integration identity
- explicit safety gates, especially outbound email/workflow mutation

### Readiness Status

Use a small enum:

```ts
type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'idle' | 'approval_gated'
```

## 4. Future Integration Direction

1. **Export generator** — ✅ 완료
   - `npm run generate:hermes-export` creates redacted `HermesExport` JSON from session DB, memory, skills, cron, Claude flow logs.
2. **Bridge server**
   - `GET /api/hermes-export` serves latest export.
3. **Live mode**
   - WebSocket/SSE updates activity/replay/source health.
4. **Execution layer**
   - Request Lab can trigger Hermes/Claude/n8n safely.
5. **Governance layer**
   - Approval gates for email sending, n8n workflow mutation, external API writes.

## 5. Quality Gates

Before calling any feature done:

```bash
npm test -- --run
npm run lint
npm run build
```

Also verify:

- local preview returns HTTP 200
- Cloudflare share URL returns HTTP 200 when active
- all meaningful agent classes have seed coverage
- README and `.claude/knowledge/*` are updated
- `task.md` status is updated

## 6. Claude Code Operating Rule

Claude Code should treat this file as the product strategy and `task.md` as the execution board. If a user asks “다음 진행해”, Claude Code should:

1. Read `plan.md` and `task.md`.
2. Pick the highest priority task with status `todo` or `doing`.
3. Create/verify `.claude/workspace/<slug>/spec.md`, `design.md`, `implementation.md`.
4. Follow TDD.
5. Run full verification.
6. Update `task.md`, README, and KB.
