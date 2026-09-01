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

- **Next task:** T09 미정 (T08 완료). 후보: 타입 스케일 정리, 한글 웹폰트 도입, 터치 타깃 44px 상향
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
| T07 | done | P1 | Request Protocol Execution Layer | Claude Code + Hermes recovery | `src/domain/requestExecution.ts`, `src/App.requestExecution.test.tsx`, 9 targeted tests passed |
| T08 | done | P2 | Design Polish + Shareable Narrative | Hermes + Claude Code | `/code-review xhigh` 15건 + `/design-review` 9건 수정; 241 tests passed; design score D+ → A- |

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

**Status:** `done`  
**Goal:** 현재 mock request queue를 실제 Hermes/Claude/n8n 호출과 안전하게 연결한다.

### Acceptance Criteria

- [x] execution target abstraction (`hermes|claude-code|n8n|google-workspace|github|local|manual`)
- [x] dry-run mode: Request Lab에서 target/action/approval/audit preview 표시
- [x] approval-gated mutation: publish/workflow/destructive/GitHub push는 승인 없이 simulated execution blocked
- [x] audit log: id/request/target/action/mode/status/reason/createdAt + `externalMutationPerformed:false`
- [x] 실패/timeout/blocked audit → `LogEvent(type:'handoff')` → Activity Blackbox / Delegation Replay 반영
- [x] UI visible contract: `Request Protocol Execution Layer` region, Execution Preview, Audit Log

### Evidence

- Claude Code가 gstack/superpower 지시로 spec/design을 진행했으나 print-mode가 장시간 무응답이라 Hermes가 중단 후 구현 회수.
- RED: `npm test -- --run src/domain/requestExecution.test.ts` → missing module failure.
- RED: `npm test -- --run src/App.requestExecution.test.tsx` → missing region failure.
- GREEN: `npm test -- --run src/domain/requestExecution.test.ts src/App.requestExecution.test.tsx` → 2 files / 9 tests passed.
- Full verification: `npm test -- --run` → 16 files / 200 tests passed, `npm run lint` → 0 warnings/errors, `npm run build` → passed.

### Design update — MACADAMIA Trading Room

- Input: `/Users/bluenote_macmini/.hermes/cache/documents/doc_d13a87b064bd_dashboard_design.md` (`dashboard_design.md`).
- Applied to current Soul Map dashboard without replacing the app domain:
  - `MACADAMIA Trading Room` header / `FINANCIAL ANALYSIS PIPELINE` chrome
  - `● LIVE` + `N/N COMPLETE` operation badges
  - fixed 190px execution-record sidebar
  - horizontal pipeline layer strip (`LAYER 0`, 병렬/순차 chips)
  - CRT scanline overlay + Bloomberg-terminal dark palette
  - agent cards/panels rethemed with blue/cyan/green terminal accents
- RED: `npm test -- --run src/App.tradingRoomDesign.test.tsx` → missing `trading-room-shell` failure.
- GREEN: `npm test -- --run src/App.tradingRoomDesign.test.tsx src/App.requestExecution.test.tsx src/domain/requestExecution.test.ts` → 3 files / 10 tests passed.

---

## T08 — Design Polish + Shareable Narrative

**Status:** `done`  
**Goal:** 외부 공유 가능한 high-grade demo로 시각/문구/스토리 강화.

### Acceptance Criteria

- [x] hero narrative 개선 — `Agent Soul Map` title restored while keeping dark terminal aesthetic
- [x] panel hierarchy 정리 — dense agent detail blocks converted to expandable disclosures
- [x] 연결 화살표가 실제로 노드에 닿고, 보이고, 방향이 맞는다
- [x] mobile 가로 오버플로 제거 · 노드 카드 겹침 제거 (데스크톱 포함)
- [x] 시각 계약 테스트를 CSS 캐스케이드 기반으로 교체
- [x] mobile/Telegram preview 고려 — 375/768/1280/1600px 전 구간에서 문서 가로 스크롤 0, 노드 겹침 0. 좁은 화면 별자리는 패널 내부 가로 스와이프(카드 129px 가독성 확보)
- [x] design review B+ 이상 — `/design-review` 결과 **D+ → A-** (AI Slop A). 리포트: `~/.gstack/projects/silphid24-Hermes-Soul-Map/designs/design-audit-20260819/`

### Evidence

**초기 구현 (Hermes)**

- `src/App.tsx`, `src/App.css` — pipeline을 `.pipeline-zone` 별도 영역으로 분리, Agent Constellation은 메인 그리드 유지, agent detail은 우측 컬럼 유지.
- 당시 검증: 17 files / **205** tests passed (이전에 204로 잘못 기록됨), lint 0, build passed.

**`/code-review xhigh` 후속 수정 (Claude Code)**

리뷰 15건 + 테스트가 추가로 찾아낸 4건을 TDD로 수정. 항목별 RED 증거는 `.claude/workspace/design-polish-shareable-narrative/implementation.md` 표 참조.

- 신규 도메인: `src/domain/constellationGeometry.ts` (픽셀 공간 연결선 기하)
- 신규 테스트 유틸: `src/test/cssModel.ts` (CSS 캐스케이드 모델), `src/test/layoutBox.ts` (jsdom 렌더 박스 주입)
- 신규 테스트 7종: `App.constellationGeometry`, `App.cssCascade`, `App.responsiveLayout`, `App.evolutionRail`, `App.stackingContext`, `App.headings`, `data/projectActivity.generated`
- `src/data/projectActivity.ts` 추적 해제 — `predev`/`prebuild`/`pretest`가 로컬 `~/.hermes`로 매번 재생성하던 파일이라 워킹트리를 계속 오염시켰다
- 검증: `npm test -- --run` → **25 files / 232 tests passed**; `npm run lint` → 0 warnings/errors; `npm run build` → passed
- 리뷰 지적 중 **#14의 z-index 부분은 성립하지 않음** — `contain: layout paint`는 해당 엘리먼트가 부모 컨텍스트에서 자기 z-index로 정렬되는 것을 막지 않는다. 근거는 implementation.md 참조


---

## FIX-01 · 생성 산출물 상시 보장 후속 (`/code-review max` 15건)

**status: done**

`main` 머지 직후 `npx vitest`가 12/25 파일에서 깨진 회귀를 급히 막은 커밋 `ad76198`이
새 결함 여러 개를 들여왔고, `/code-review max`가 15건을 지적했다. 전부 TDD로 처리.

### Evidence

- 신규 테스트: `src/data/projectActivityGeneration.test.ts` (13건, 전부 RED 확인 후 GREEN)
- `scripts/generate-project-activity.mjs` — `generateProjectActivity()` 로 export.
  spawn 제거로 경로 분기·stdout 오염·프로세스 비용이 한 번에 사라짐. `mkdirSync` 가드,
  임시파일+`renameSync` 원자적 교체, python3 sqlite 호출 `timeout`
- `scripts/generatedDataPlugin.mjs` — 생성기와 같은 `resolveOutputPath()` 사용,
  0바이트/5분 신선도 판정, 실패 시 컨텍스트 포함 재throw
- `package.json` — `postinstall` → `prepare`, `predev`/`pretest` 제거(플러그인이 대체),
  `typecheck`/`pretypecheck` 추가, `engines.node >=20.11`
- `tsconfig.node.json` — `vitest.config.ts` 포함. 넣자마자 vite 8(rolldown) ↔
  vitest 번들 vite(rollup) 의 `Plugin` 타입 충돌이 드러나 구조적 타입으로 해결
- `src/data/projectActivity.test.ts` — "무조건 최신" 요구를 "evidence와 일치"로 재정의.
  `~/.hermes` 없는 머신에서도 통과 (시뮬레이션으로 양방향 검증)
- 문서: `.claude/knowledge/generated-data-entry-points.md`,
  `.claude/workspace/generated-data-always-present/implementation.md`, README
- 검증(매 실행 전 생성 파일 삭제): 26 files / **255** tests, build/typecheck/lint 통과,
  dev 서버 200, `--reporter=json` 파싱 OK
- **남는 구멍을 문서화함**: `npm install` 없이 생짜 `npx tsc -b` 는 여전히 실패한다.
  플러그인은 구조적으로 TypeScript 컴파일러 경로에 닿을 수 없다.

---

## Maintenance Rule

작업 완료 시 반드시:

1. 해당 task status를 `done`으로 변경
2. Evidence에 주요 파일과 검증 결과 기록
3. README 업데이트
4. `.claude/knowledge/`에 재사용 결정 기록
5. preview URL health 확인
