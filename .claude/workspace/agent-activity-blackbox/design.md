---
title: Agent Activity Blackbox
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, frontend, security, designer]
---

# Design — Agent Activity Blackbox

## 도메인

신규 `src/domain/activity.ts`:

- `summarizeAgentActivity(agent, events)`
- 입력: 선택 `Agent`, 전체 `LogEvent[]`
- 출력:
  - `status`: `active | quiet | warning | idle`
  - `lastActivityAt`
  - `recentEventCount`
  - `changedFiles[]`
  - `validationSignals[]`
  - `riskSignals[]`
  - `latestSummaries[]`

## 파싱 규칙

- 이벤트 필터: `event.agentId === agent.id` 또는 `event.source === agent.id`.
- 최근 정렬: timestamp desc.
- 변경 파일 추출: summary에서 `src/...`, `.claude/...`, `README.md`, `examples/...`, `package.json` 등 경로 패턴 추출.
- 검증 신호: summary에 `test`, `lint`, `build`, `passed`, `0 errors` 포함.
- 리스크 신호: `timeout`, `fail`, `error`, `changes_requested` 포함.

## UI

`AgentDetail` 하단에 `ActivityBlackbox` 카드 추가.

- 최근 상태
- 마지막 활동
- 최근 이벤트 수
- 변경 파일 chips
- 검증/리스크 chips
- 최근 summary 3개

## 보안

- 파일 내용을 읽지 않음. 이미 import/seed에 있는 summary 텍스트만 표시.
- React escape 사용. `dangerouslySetInnerHTML` 금지.

## 테스트

- 변경 파일 추출
- validation/risk signal 추출
- 이벤트 없음 idle
- 최신순 정렬
