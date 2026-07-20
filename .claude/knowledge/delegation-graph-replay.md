# Delegation Graph Replay

확정일: 2026-07-18

## 결정

Soul Map의 3번 고도화 기능은 `Delegation Graph Replay`로 정의한다. 정적 요청 큐만 보여주지 않고, 기존 `InterAgentRequest`와 `handoff` 이벤트를 조합해 에이전트 간 위임 흐름을 시간순으로 재생 가능한 구조로 파생한다.

## 도메인 함수

```ts
buildDelegationReplay(agents, events, requests)
```

## 출력 계약

- `steps`: 오래된 → 최신 replay step
- `edges`: `from → to` 방향 간선, count/latest/risk 포함
- `status`: `idle | flowing | blocked | complete`
- `riskCount`
- `latestPath`

## 리스크 규칙

- request status `declined`
- handoff summary에 다음 키워드 포함:
  - `timeout`
  - `timed out`
  - `fail`
  - `error`
  - `changes_requested`
- 단, `0 errors`는 clean lint 신호로 보고 제거 후 검사.

## UI 위치

Dashboard grid에서 `Inter-Agent Request Lab` 다음에 `Delegation Graph Replay` 패널을 배치한다.

## 검증

도메인 테스트 15개 포함, 전체 99 tests passed.
