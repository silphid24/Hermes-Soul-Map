---
title: Agent Runbook / Operating Manual — Implementation
status: approved
approval_basis: Hermes final verification + gstack self-review; independent reviewer session not run
approvals:
  qa: self_reviewed
required_approvals: [qa]
---

# Implementation — Agent Runbook / Operating Manual (T06)

## 구현 요약

T06은 Claude Code에 gstack/superpower workflow로 위임했다. Claude Code가 spec/design과 도메인 구현 대부분을 작성했으나, print-mode 실행이 장시간 무응답 상태가 되어 Hermes가 프로세스를 중단하고 partial work를 회수해 완성했다.

## 변경 파일

- `src/domain/runbook.ts`
  - `AgentRunbook`, `RunbookItem`, `RunbookPosture`, `RUNBOOK_SECTIONS`
  - `buildRunbooks()` / `buildAgentRunbook()`
  - capability readiness + activity summary + agent/request 신호에서 7개 섹션 파생
  - export override 병합, 안전 섹션 축소 불가
- `src/domain/runbook.test.ts`
  - 도메인 TDD 39 tests
- `src/App.tsx`
  - Agent Detail 내부 `Agent Runbook / Operating Manual` 패널 추가
  - 선택 에이전트/요청/활동 이벤트와 연동
- `src/App.css`
  - runbook panel / section / evidence / posture 스타일
- `src/App.runbook.test.tsx`
  - visible contract 6 tests
- `src/types.ts`
  - `RunbookOverride`, `Agent.runbook?`
- `src/data/hermesExport.ts`
  - `HermesRunbookInput`, `HermesProfile.runbook?`, `normalizeRunbook()`
- `src/data/hermesExport.test.ts`
  - import override mapping / invalid field drop tests
- `README.md`, `plan.md`, `task.md`
- `.claude/knowledge/agent-runbook-operating-manual.md`

## 주요 구현 결정

### 1. Readiness 재사용

Runbook은 `buildCapabilityReadiness()` 결과를 소비한다. 별도의 capability 계산을 만들지 않았다. 이유는 Readiness Matrix와 Runbook의 판단이 서로 어긋나면 제품 신뢰도가 떨어지기 때문이다.

### 2. 안전 섹션 축소 불가

`HermesExport.profiles[].runbook`이 들어와도 다음 섹션은 파생 안전장치를 제거하지 못한다.

- `approvalRequired`
- `forbiddenActions`

이 섹션은 파생 항목 + export 항목의 합집합이다. import JSON은 신뢰 경계 밖이므로 안전장치를 지우지 못한다.

### 3. Evidence visible contract

모든 runbook item은 `evidence`를 가진다. UI에서도 `.runbook-evidence`로 렌더한다. 이는 정적 문구가 아니라 실제 agent/capability/activity/risk 신호에서 나온 운영 규칙임을 사용자가 확인할 수 있게 한다.

### 4. 외부 부작용 없음

이번 구현은 관측/운영 매뉴얼 계층이다. 메일 발송, n8n workflow mutation, GitHub push/release, destructive local ops는 실제로 수행하지 않는다. 모두 승인 게이트로 표시만 한다.

## 검증

최종 완료 보고 시 Hermes가 다음을 직접 실행했다.

```bash
npm test -- --run src/domain/runbook.test.ts src/App.runbook.test.tsx
npm test -- --run
npm run lint
npm run build
```

## gstack/self-review

독립 reviewer agent 세션은 실행하지 않았다. 따라서 spec/design/implementation frontmatter는 `approved`이지만 `approval_basis`에 self-review임을 명시했다.

사용한 관점:

- `/spec`: Readiness Matrix와 중복되지 않는 운영 계약 계층으로 scope 고정
- `/plan-eng-review`: readiness 재사용, 테스트 매트릭스, 안전 섹션 축소 불가
- `/design-review`: Agent Detail 내부 panel, tone 색상, evidence 표시
- `/review`: false positive gate 방지, export override 안전성
- `/qa`: jsdom visible contract + full verification

## 후속

T07에서는 runbook의 승인 게이트를 실제 Request Protocol Execution Layer와 연결한다.

- dry-run mode
- approval-gated mutation
- audit log
- timeout/failure replay 반영
