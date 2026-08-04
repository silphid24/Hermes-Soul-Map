---
title: Agent Runbook / Operating Manual
status: approved
approval_basis: gstack self-review (독립 리뷰어 세션 없음 — Reviews 섹션에 근거 기록)
approvals:
  designer: self_reviewed
  security: self_reviewed
  qa: self_reviewed
required_approvals: [designer, security, qa]
---

# Spec — Agent Runbook / Operating Manual (T06)

## 목표

Soul Map은 지금까지 다음을 답해 왔다.

| 기존 레이어 | 답하는 질문 |
|---|---|
| Agent Activity Blackbox | 이 에이전트가 **무슨 일을 했는가** |
| Soul Diff / Identity Drift | 이 에이전트는 **누구인가 / 어떻게 변했는가** |
| Delegation Graph Replay | 일이 **어떻게 위임되어 흘렀는가** |
| Capability Readiness Matrix | **누가 무엇을 맡을 수 있는가** |

T06이 답할 질문은 그 다음이다.

> **"그래서 이 에이전트를 실제로 어떻게 써야 하는가? 무엇을 마음대로 시켜도 되고, 무엇은 내 승인을 받아야 하고, 무엇은 절대 시키면 안 되는가?"**

즉 Readiness Matrix가 *가능성(capability)* 을 말한다면, Runbook은 *운영 규칙(operating contract)* 을 말한다.

## 배경 / KB 조회 결과 (선행 단계)

`/kb` 대상 = `.claude/knowledge/*.md`. 관련 문서를 먼저 읽고 재사용 결정을 정리했다.

- `capability-readiness-matrix.md`
  - `buildCapabilityReadiness(agents, events, requests)` 가 이미 (agent × capability) 별 `ready|partial|blocked|idle|approval_gated` 와 근거(reasons)를 파생한다.
  - **결정: Runbook은 readiness 계산을 다시 만들지 않고 그 출력을 소비한다.** 두 패널이 서로 모순되면 안 되기 때문이다.
  - governance rule: `external_send` 는 affinity만 있으면 trust/autonomy와 무관하게 `approval_gated`. Runbook의 승인 게이트는 이 규칙의 **상위 집합**이어야 한다.
- `agent-activity-blackbox.md` / `agent-activity-blackbox-live-updates.md`
  - risk 파싱 규칙(`timeout` / `fail`·`error` / `changes_requested`, `0 errors` 는 clean)과 `summarizeAgentActivity` 재사용.
  - **evidence가 없으면 지어내지 않는다**는 원칙(가짜 heartbeat 금지). Runbook도 동일 — 신호 없는 섹션은 비어 있어야 한다.
- `soul-diff-identity-drift.md`
  - 신호가 없을 때 `unknown` 으로 정직하게 표기하는 관례 → Runbook 빈 섹션 표기에 반영.
- `delegation-graph-replay.md`
  - 순수 함수 + 기존 타입 조합, 새 코어 스키마 최소화 원칙.
- `hermes-export-v2-contract.md` / `live-hermes-export-generator.md`
  - `HermesExport` 는 optional 필드를 안전하게 fallback 하고 절대 throw 하지 않는다.
  - 실데이터(`examples/*.local.json`)는 커밋 금지, redaction 유지.

## 범위 (In Scope)

1. 도메인 타입 + 파생 함수 (`src/domain/runbook.ts`)
2. import 계약 확장: `HermesExport.profiles[].runbook` (optional)
3. 코어 타입 확장: `Agent.runbook?: RunbookOverride` (optional, seed는 사용하지 않음)
4. UI: 대시보드 전용 패널 `Agent Runbook / Operating Manual` (선택된 에이전트 기준)
5. 승인 게이트 명시화: 메일 발송 / n8n workflow mutation / GitHub push·release / destructive local ops / 외부 게시
6. 문서: README, `.claude/knowledge/agent-runbook-operating-manual.md`, `task.md`

## 범위 밖 (Out of Scope)

- 실제 실행/승인 버튼(승인 워크플로 실행) — T07 Request Protocol Execution Layer
- 외부 서비스 호출, 메일 발송, n8n mutation — 이번 사이클에서 **절대 하지 않는다**
- runbook 편집 UI (읽기 전용 관측 계층 유지)

## 사용자 시나리오

동한이 대시보드에서 `Google Workspace API` 노드를 누르면:

- **posture**: `supervise` (감독 필요)
- **추천 위임 상황**: Workspace Ops 관련 작업
- **승인 없이 가능**: Drive/Docs/Sheets 읽기·초안 작성
- **승인 필요**: 메일 발송(초안까지만 자동), 외부 공유/권한 변경
- **금지**: 승인 없는 자동 발송, 개인/회사 경계를 넘는 데이터 이동
- **운영 제약**: 자율성 55% — 단계별 확인
- **검증 체크리스트**: 발송 전 수신자·본문·draft 상태 확인
- **중단 조건**: 승인 응답이 없으면 보류, 동일 작업 2회 실패 시 중단

`Claude Code Dev Cell` 을 누르면 완전히 다른 내용이 나와야 한다 (코드/빌드/테스트 위임, GitHub push·release 승인, destructive local ops 승인, `npm test/lint/build` 검증 체크리스트).

## Acceptance Criteria

- [x] `src/domain/runbook.ts` 에 runbook 도메인 타입 + 파생 함수 추가
- [x] `HermesExport` 에 runbook 정보가 있으면 사용, 없으면 agent/capability/readiness/activity/risk/safety 신호에서 파생
- [x] 에이전트별 다음 7개 섹션 표시
  - [x] recommended delegation situations
  - [x] allowed actions (승인 불필요)
  - [x] approval required actions
  - [x] forbidden actions
  - [x] operating constraints
  - [x] verification checklist
  - [x] escalation / stop conditions
- [x] 외부 발송/production mutation 승인 규칙 명시: email, n8n workflow mutation, GitHub push/release, destructive local ops, 외부 게시
- [x] agent detail UI 패널 추가 + 선택 에이전트 연동
- [x] static seed 에서도 에이전트별로 **눈에 띄게 다른** runbook (가짜 신호 생성 금지)
- [x] TDD: 실패 테스트 → 구현 → 통과
- [x] UI visible contract 를 jsdom/Testing Library 로 검증
- [x] `npm test -- --run`, `npm run lint`, `npm run build` 통과
- [x] README / KB / task.md 갱신

## 안전 규칙 (Security-critical)

1. **승인 게이트는 축소 불가**: export가 runbook을 제공해도, 파생된 `approvalRequired` / `forbiddenActions` 항목은 제거되지 않는다(합집합). export는 게이트를 **추가**할 수만 있다.
   - 이유: import JSON은 신뢰 경계 밖이다. 외부 JSON이 "메일 자동 발송 허용"을 주장해 안전장치를 지우면 안 된다.
2. **fail-safe 방향**: 신호가 애매하면 `allowed` 가 아니라 `approvalRequired` 로 분류한다.
3. **지어내기 금지**: 신호가 없는 섹션은 비운다. 동일 시각 heartbeat 같은 합성 신호를 만들지 않는다.
4. 이번 구현에서 외부 호출/메일/n8n mutation/GitHub push 는 **수행하지 않는다** (문서·UI 표기만).

## Reviews

독립 리뷰어 세션이 없으므로 아래는 **gstack 관점 self-review** 기록이다. 승인 상태는 `self_reviewed` 로 표기했고 타인 승인으로 위조하지 않았다.

### `/office-hours` · `/spec` 관점 (product)

- 질문: "Readiness Matrix가 이미 누가 뭘 할 수 있는지 보여주는데 Runbook은 중복 아닌가?"
  - 답: Readiness = 가능성(선택), Runbook = 운영 계약(승인·금지·중단). 중복을 피하려고 Runbook은 readiness 출력을 **입력으로 소비**하고 재계산하지 않는다. → 스펙에 명시.
- 질문: "MVP 최소 단위는?"
  - 답: 7개 섹션 중 승인/금지가 제품 가치의 핵심. 나머지 5개는 같은 파생 엔진에서 거의 공짜로 나온다 → 전부 포함.

### `/plan-ceo-review` 관점 (scope)

- 실행 버튼(T07)까지 끌어오면 범위가 2배가 되고 되돌리기 어려운 외부 호출이 생긴다 → **관측·문서 계층으로 한정**. plan.md 원칙 1("실행 버튼보다 관측 계층 우선")과 일치.

### `/cso` 관점 (security)

- 최대 리스크: import된 runbook이 안전장치를 **무력화**하는 것 → 안전 규칙 1(합집합, 축소 불가)로 차단하고 테스트로 고정.
- 두 번째 리스크: runbook 텍스트에 실데이터 시크릿이 섞여 커밋되는 것 → seed는 override를 쓰지 않고, 실데이터 export는 기존대로 `examples/*.local.json`(gitignore).

### `/qa` 관점

- seed 9개 에이전트가 서로 다른 runbook을 내는지, 빈 섹션이 크래시 없이 표기되는지, 승인 게이트 문구가 실제로 렌더되는지 → 도메인 테스트 + jsdom UI 테스트로 검증한다.
