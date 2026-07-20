---
title: Agent Activity Blackbox — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Agent Activity Blackbox

## 구현 요약

- `src/domain/activity.ts` 추가.
- `summarizeAgentActivity(agent, events)`로 에이전트별 활동 블랙박스 요약 생성.
- Agent Detail에 `Agent Activity Blackbox` 카드 추가.
- Claude Code seed 로그에 최근 개발 활동/검증/변경 파일 신호 추가.
- 비개발 에이전트도 cron/handoff/memory/skill/decision/high-importance 신호를 Blackbox에 표시하도록 확장.
- sample export의 Claude Code flow log에 검증 로그 추가.
- README 구조/검증 수치 갱신.

## TDD 기록

1. `src/domain/activity.test.ts` 작성.
2. RED 확인:
   - `Failed to resolve import "./activity"` — 구현 파일 없음으로 실패.
3. `src/domain/activity.ts` 구현.
4. GREEN 확인:
   - activity 테스트 4개 통과.

## 검증 결과

```bash
npm test -- --run
# 7 files passed, 77 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```

## 남은 리스크

- 아직 실제 `.claude/logs/flow.jsonl`을 브라우저가 직접 읽지는 않는다.
- 현재는 seed/imported `LogEvent[]` 기반 블랙박스이다.
- 다음 단계는 local export generator가 실제 flow log를 `HermesExport.flowLogs`로 생성하는 것.
