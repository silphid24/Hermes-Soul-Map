# Agent Runbook / Operating Manual

확정일: 2026-08-04

## 결정

T06은 Capability Readiness Matrix 다음 계층이다. Readiness가 "누가 무엇을 할 수 있는가"를 답한다면, Runbook은 "이 에이전트를 실제로 어떻게 운영해야 하는가"를 답한다.

Runbook은 실행 기능이 아니다. T07 이전까지는 관측·판단·거버넌스 문서화 계층으로 유지한다.

## 구조

- `src/domain/runbook.ts` — 순수 도메인 파생 함수.
  - `buildRunbooks(agents, events, requests)`
  - `buildAgentRunbook(agent, events, requests)`
  - `RUNBOOK_SECTIONS`
- `src/types.ts`
  - `RunbookOverride`
  - `Agent.runbook?: RunbookOverride`
- `src/data/hermesExport.ts`
  - `HermesExport.profiles[].runbook?` 정규화 후 `Agent.runbook`으로 전달
- `src/App.tsx`
  - Agent Detail 내부 `Agent Runbook / Operating Manual` 패널

## 7개 섹션

1. `delegateWhen` — 추천 위임 상황
2. `allowedActions` — 승인 없이 가능한 행동
3. `approvalRequired` — 사람 승인 필요
4. `forbiddenActions` — 금지 행동
5. `constraints` — 운영 제약
6. `verification` — 검증 체크리스트
7. `stopConditions` — 에스컬레이션 / 중단 조건

모든 `RunbookItem`은 `evidence`를 가진다. UI도 evidence를 표시한다. 이는 규칙이 임의 텍스트가 아니라 capability/activity/risk/agent 신호에서 파생됐음을 보여주는 visible contract다.

## 재사용 규칙

Runbook은 readiness를 재계산하지 않는다. 반드시 `buildCapabilityReadiness()` 출력을 소비한다. 두 패널이 서로 모순되면 안 된다.

사용하는 신호:

- `buildCapabilityReadiness()` cells: status, score, reasons
- `summarizeAgentActivity()` output: changedFiles, validationSignals, riskSignals, lastActivityAt
- `Agent`: kind, status, trust, autonomy, soul.coherence, memory.recentGrowth, specialty/description/skills/soul.values
- `InterAgentRequest`: 수신 요청 capability

## 승인 게이트 규칙

다음은 fail-safe로 `approvalRequired`에 들어간다.

- 메일 발송: Gmail/mail/메일/Outlook/이메일 신호
- 외부 게시/발송: 게시/publish/tweet/social/Telegram/SNS 신호
- n8n workflow mutation: n8n/workflow/워크플로 신호
- 자동화 파이프라인 변경: automation/MCP/pipeline + automation capability
- GitHub push/release/deploy: 코드 소유권 신호
- destructive local ops: 파일 변경 관측 또는 코드 실행 능력
- production 데이터 쓰기: `kind === 'integration'`
- Readiness Matrix의 `approval_gated` 셀 전체

중요: 게이트 대상 capability는 `allowedActions`에 중복 노출하지 않는다.

## Import override 안전 규칙

`HermesExport.profiles[].runbook`은 optional override다. 단 import JSON은 신뢰 경계 밖이므로 안전 섹션은 축소할 수 없다.

- `approvalRequired`, `forbiddenActions`: 파생 항목 유지 + export 항목 추가 (union)
- 나머지 섹션: export가 유효한 문자열 배열을 제공하면 replace
- 빈 배열/잘못된 타입/빈 문자열: 무시하고 파생 유지
- `headline`: 유효 문자열이면 replace
- provenance: override가 있으면 `merged`, 없으면 `derived`

## 테스트 고정

- `src/domain/runbook.test.ts`
  - shape/determinism
  - mail/n8n/code/social/integration approval gates
  - gate false positive 방지
  - allowed/gated 중복 방지
  - forbidden/constraints/verification/stop conditions
  - export override merge + 안전 섹션 축소 불가
  - seed 다양성
- `src/App.runbook.test.tsx`
  - 패널 region 렌더
  - 7개 섹션 제목
  - 선택 agent 연동
  - Google Workspace mail gate
  - Claude Code GitHub/destructive gate
  - 에이전트 전환 시 내용 변경
  - 모든 list item에 `.runbook-evidence`

## gstack/self-review 기록

Claude Code에는 gstack/superpower workflow 사용을 지시했다. 장시간 무응답으로 Hermes가 중단 후 partial work를 회수해 완성했다. spec/design 문서의 `approvals`는 실제 독립 리뷰가 아니므로 `self_reviewed`로 표기한다. 허위 approval을 쓰지 않는다.

## 후속

T07 Request Protocol Execution Layer에서 Runbook의 승인 게이트를 실제 dry-run/approval/audit log 실행 계층과 연결한다. 이번 T06은 외부 서비스 호출, 메일 발송, n8n mutation, GitHub push를 하지 않는다.
