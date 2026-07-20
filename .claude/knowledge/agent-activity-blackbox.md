# Agent Activity Blackbox

확정일: 2026-07-16

## 결정

Claude Code dev cell은 우선 실행 버튼이 아니라 `LogEvent[]`를 요약하는 관찰 패널로 만든다.

## 구현

- 도메인 함수: `summarizeAgentActivity(agent, events)`
- 출력: 상태, 마지막 활동, 최근 이벤트 수, 변경 파일, 검증 신호, 리스크 신호, 최근 summary.
- UI 위치: Agent Detail 내부 `Activity Blackbox` 카드.

## 파싱 규칙

- agent match: `event.agentId === agent.id || event.source === agent.id`
- validation: `test passed`, `lint clean`, `build passed`
- operation: `cron activity`, `handoff routed`, `memory updated`, `skill signal`, `decision logged`, `high importance`
- risk: timeout, failure/error, changes_requested
- 파일 경로: `src/...`, `.claude/...`, `.codex/...`, `README.md`, `examples/...`, config files.

## 다음 단계

실제 `.claude/logs/flow.jsonl`과 workspace implementation 문서를 읽는 local export generator가 `HermesExport.flowLogs`를 생성하면 이 패널은 자동으로 live-like 상태가 된다.
