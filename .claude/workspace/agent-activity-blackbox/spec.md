---
title: Agent Activity Blackbox
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Agent Activity Blackbox

## 목표

Claude Code cell을 실행 버튼이 아니라 **실제/가져온 활동 기록을 요약하는 블랙박스**로 만든다.

## 요구사항

- `LogEvent[]`에서 선택 에이전트의 최근 활동을 요약한다.
- Claude Code flow log summary에서 변경 파일 후보를 추출한다.
- 최근 활동 수, 마지막 활동 시각, 변경 파일 수, 검증 신호(test/lint/build), 리스크 신호(timeout/fail/error)를 계산한다.
- UI는 Agent Detail 내부에 `Activity Blackbox` 카드로 표시한다.
- seed/import 양쪽에서 동작해야 한다.
- 실제 Claude Code 실행 버튼/백엔드 브릿지는 만들지 않는다.

## Acceptance Criteria

- 신규 도메인 테스트가 통과한다.
- `npm test -- --run`, `npm run lint`, `npm run build` 통과.
- Claude Code 선택 시 최근 활동/파일/검증/리스크가 보인다.
