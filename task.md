# Hermes Agent Soul Map — Task Board

> **Source of truth for execution.** Claude Code와 Hermes는 작업 전 이 파일을 읽고, 작업 후 status/evidence를 갱신한다.

## Status Legend

| Status | Meaning |
|---|---|
| `done` | 구현/검증/문서화 완료 |
| `doing` | 현재 진행 중 |
| `todo` | 다음 개발 대상 |
| `blocked` | 외부 결정/기술 이슈 필요 |
| `backlog` | 방향은 맞지만 아직 착수 전 |

## Current Pointer

- **Next task:** T07 — Request Protocol Execution Layer
- **Preferred implementer:** Claude Code for feature implementation, Hermes for orchestration/final verification
- **Verification:** `npm test -- --run` + `npm run lint` + `npm run build`

## Task Board

| ID | Status | Priority | Feature | Owner | Evidence |
|---|---|---:|---|---|---|
| T01 | done | P0 | Agent Activity Blackbox | Hermes + Claude Code | `src/domain/activity.ts`, 78+ tests lineage |
| T02 | done | P0 | Soul Diff / Identity Drift | Hermes | `src/domain/identityDrift.ts`, `SoulSnapshot`, `soulHistory` |
| T03 | done | P0 | Delegation Graph Replay | Claude Code + Hermes | `src/domain/delegationReplay.ts`, 99 tests passed |
| T04 | done | P0 | Capability Readiness Matrix | Claude Code + Hermes | `src/domain/capabilityReadiness.ts`, 125 tests passed |
| T05 | done | P1 | Live Hermes Export Generator | Claude Code | `scripts/hermesExportCore.mjs`, `scripts/generate-hermes-export.mjs`, 142 tests passed |
| T06 | done | P1 | Agent Runbook / Operating Manual | Claude Code + Hermes recovery | `src/domain/runbook.ts`, `src/App.runbook.test.tsx`, 45 targeted tests passed |
| T07 | backlog | P1 | Request Protocol Execution Layer | Claude Code + Hermes | Not started |
| T08 | backlog | P2 | Design Polish + Shareable Narrative | Claude Code + design review | Not started |

---

## T04 — Capability Readiness Matrix

**Status:** `done`  
**Owner:** Claude Code + Hermes  
**Goal:** Dashboard에서 “어떤 에이전트가 어떤 capability를 맡을 준비가 되어 있는가?”를 한눈에 보여준다.

### Acceptance Criteria

- [x] `src/domain/capabilityReadiness.ts` 추가
- [x] `src/domain/capabilityReadiness.test.ts` TDD로 RED → GREEN 기록
- [x] `CapabilityReadinessMatrix` UI 패널 추가
- [x] 최소 capability 축:
  - [x] `observe_logs`
  - [x] `document_minutes`
  - [x] `code_build_test`
  - [x] `automation_cron`
  - [x] `workspace_ops`
  - [x] `external_send`
- [x] readiness status enum:
  - [x] `ready`
  - [x] `partial`
  - [x] `blocked`
  - [x] `idle`
  - [x] `approval_gated`
- [x] status는 seed에 하드코딩하지 말고 Agent/Skill/Event/Activity/Risk/Soul 신호에서 파생
- [x] 외부 발송/production mutation은 `approval_gated` 표현
- [x] Claude Code, Hermes, izera365, Doc Auto Agent, Google Workspace, n8n 등 서로 다른 agent class가 시각적으로 다르게 보임
- [x] README 업데이트
- [x] `.claude/workspace/capability-readiness-matrix/{spec.md,design.md,implementation.md}` 생성
- [x] `.claude/knowledge/capability-readiness-matrix.md` 생성
- [x] 최종 검증 통과:
  - [x] `npm test -- --run`
  - [x] `npm run lint`
  - [x] `npm run build`

### Suggested Domain Contract

```ts
export type CapabilityKey =
  | 'observe_logs'
  | 'document_minutes'
  | 'code_build_test'
  | 'automation_cron'
  | 'workspace_ops'
  | 'external_send'

export type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'idle' | 'approval_gated'

export interface CapabilityReadinessCell {
  agentId: string
  agentName: string
  capability: CapabilityKey
  status: ReadinessStatus
  score: number
  reasons: string[]
}

export interface CapabilityReadinessMatrix {
  capabilities: CapabilityKey[]
  agents: string[]
  cells: CapabilityReadinessCell[]
  topReady: CapabilityReadinessCell[]
  gated: CapabilityReadinessCell[]
}
```

### Suggested TDD Slices

1. **RED:** Claude Code should be `ready` for `code_build_test` from tool kind/skills/activity signals.
2. **GREEN:** Implement minimal derivation.
3. **RED:** Google Workspace and n8n should be `approval_gated` for `external_send` / production mutation capability.
4. **GREEN:** Add safety gate rules.
5. **RED:** Doc Auto Agent should be `ready` or `partial` for `document_minutes` from document/meeting/cron signals.
6. **GREEN:** Add document capability scoring.
7. **RED:** dormant/planned/risk-heavy agent should not show as `ready`.
8. **GREEN:** Add status/risk damping.
9. **UI integration:** Add panel and verify visible seed variety.

### Claude Code Prompt

Use this prompt when delegating T04:

```text
Read plan.md and task.md first. Implement T04 Capability Readiness Matrix using strict TDD.
Follow project CLAUDE.md lifecycle: create approved spec/design/implementation docs under .claude/workspace/capability-readiness-matrix/.
Do not hardcode UI cells. Derive readiness from Agent, Skill, LogEvent, request/activity/risk signals.
Add tests for dev/tool, cron/document, workspace/integration, automation/n8n, approval-gated external operations, and risk/status damping.
Add a polished dashboard panel.
Update README, .claude/knowledge/capability-readiness-matrix.md, and task.md status/evidence.
Run npm test -- --run, npm run lint, npm run build.
```

---

## T05 — Live Hermes Export Generator

**Status:** `done`  
**Owner:** Claude Code  
**Goal:** 실제 Hermes session DB/memory/skills/cron/Claude flow logs를 읽어 `HermesExport` JSON 생성.

### Acceptance Criteria

- [x] 로컬 script 또는 CLI 추가 (`scripts/generate-hermes-export.mjs`, `npm run generate:hermes-export`)
- [x] `HERMES_HOME` env override + 출력 경로 arg(`--out=`)/env(`HERMES_EXPORT_OUT`) 지원
- [x] 민감정보 redaction (API key·JWT·이메일·OS 사용자명 경로·`KEY=VALUE`; 최종 `redactDeep`)
- [x] 소스 누락/읽기 실패에 resilient (채널 `error`/`empty` 표기, 크래시 없음)
- [x] `sourceHealth` 5채널 채움
- [x] browser import 가능한 sample 유지 (`examples/hermes-export.sample.json`, 실데이터는 `examples/*.local.json` gitignore)
- [x] TDD RED→GREEN (`scripts/hermesExportCore.test.ts`, 17 tests)
- [x] README / `.claude/knowledge/live-hermes-export-generator.md` 갱신
- [x] `.claude/workspace/live-hermes-export-generator/{spec,design,implementation}.md`
- [x] 검증: `npm test -- --run`(142), `npm run lint`(0), `npm run build`

### Evidence

- 실데이터 실행: profiles=6 sessions=6 cron=3 flowLogs=40, 유출 스캔 0건(username/`/Users/`/email/token).
- 견고성: `HERMES_HOME=/tmp/none` → 유효 export, `sessions=empty`.

---

## T06 — Agent Runbook / Operating Manual

**Status:** `done`  
**Goal:** 각 에이전트별 사용법, 권한, 승인 게이트, 금지행동, 추천 위임 상황을 UI에서 보여준다.

### Acceptance Criteria

- [x] runbook 도메인 타입 + 파생 함수 (`src/domain/runbook.ts`)
- [x] seed/import 계약: `Agent.runbook?`, `HermesExport.profiles[].runbook?`, 안전 섹션 축소 불가
- [x] agent detail panel: `Agent Runbook / Operating Manual`
- [x] 외부 발송/production mutation 승인 규칙 명확화: 메일 발송, n8n workflow mutation, GitHub push/release, destructive local ops, 외부 게시
- [x] 7개 섹션: 추천 위임, 승인 없이 가능, 승인 필요, 금지, 운영 제약, 검증 체크리스트, 중단 조건
- [x] TDD + visible UI contract: `src/domain/runbook.test.ts`, `src/App.runbook.test.tsx`

### Evidence

- Claude Code가 gstack/superpower 지시로 spec/design과 도메인 구현을 진행했으나 장시간 무응답으로 Hermes가 중단 후 로컬 변경을 회수해 완성.
- targeted verification: `npm test -- --run src/domain/runbook.test.ts src/App.runbook.test.tsx` → 45 passed.
- full verification: `npm test -- --run` → 191 passed, `npm run lint` → 0 warnings/errors, `npm run build` → passed.

---

## T07 — Request Protocol Execution Layer

**Status:** `backlog`  
**Goal:** 현재 mock request queue를 실제 Hermes/Claude/n8n 호출과 안전하게 연결한다.

### Acceptance Criteria

- [ ] execution target abstraction
- [ ] dry-run mode
- [ ] approval-gated mutation
- [ ] audit log
- [ ] 실패/timeout replay 반영

---

## T08 — Design Polish + Shareable Narrative

**Status:** `backlog`  
**Goal:** 외부 공유 가능한 high-grade demo로 시각/문구/스토리 강화.

### Acceptance Criteria

- [ ] hero narrative 개선
- [ ] panel hierarchy 정리
- [ ] mobile/Telegram preview 고려
- [ ] design review B+ 이상

---

## Maintenance Rule

작업 완료 시 반드시:

1. 해당 task status를 `done`으로 변경
2. Evidence에 주요 파일과 검증 결과 기록
3. README 업데이트
4. `.claude/knowledge/`에 재사용 결정 기록
5. preview URL health 확인
