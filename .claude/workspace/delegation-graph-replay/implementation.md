---
title: Delegation Graph Replay — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Delegation Graph Replay

## Claude Code 실행 기록

- Claude Code v2.1.214 / Max account로 구현 진행.
- 1차 `claude -p` 실행은 Hermes terminal 600s timeout으로 종료됐지만, 도메인 구현/테스트 파일을 남김.
- 2차 `claude -p` 실행은 `error_max_turns`로 종료됐지만, App UI 연결까지 완료됨.
- Hermes가 이후 직접 검증/문서/CSS 보강을 완료.

## 구현 요약

- `src/domain/delegationReplay.ts`
  - `buildDelegationReplay(agents, events, requests)` 추가.
  - 요청/위임 이벤트를 시간순 replay step으로 파생.
  - 에이전트 간 방향 edge 집계.
  - `idle | flowing | blocked | complete` 상태 계산.
  - timeout/fail/error/changes_requested/declined 리스크 감지.
- `src/domain/delegationReplay.test.ts`
  - 15개 테스트로 상태, 스텝, 리스크, 간선, 결정론, fallback 검증.
- `src/App.tsx`
  - `DelegationReplayPanel` 추가.
  - dashboard grid에 Request Lab 다음 표시.
- `src/App.css`
  - Delegation Replay panel 스타일 추가.
- README/KB 갱신.

## 검증

```bash
npm test -- --run
# 9 files passed, 99 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```
