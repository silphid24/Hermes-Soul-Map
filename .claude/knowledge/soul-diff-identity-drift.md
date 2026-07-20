# Soul Diff / Identity Drift

확정일: 2026-07-16

## 결정

Soul Map은 각 에이전트의 현재 상태를 과거 `EvolutionSnapshot` baseline과 비교해 정체성 drift를 표시한다.

## 구현

- 도메인 함수: `identityDrift(agent, snapshots)`
- 비교 기준:
  - baseline = 가장 오래된 snapshot
  - latest = 가장 최근 snapshot
  - 현재 Agent 상태와 baseline을 비교
- delta:
  - autonomy: `agent.autonomy - baseline.autonomy`
  - memory: `agent.memory.longTerm - baseline.memoryCount`
  - skill: `agent.skills.length - baseline.skillCount`
  - level: `latest.level - baseline.level`

## 상태

- `unknown`: snapshot 없음
- `emerging`: snapshot 1개
- `growing`: 의미 있는 증가
- `regressing`: autonomy 하락
- `stable`: 변화 없음

## 다음 단계

`HermesExport`에 historical soul snapshot(identity/tone/mood/values/coherence history)이 추가되면 문장/가치 단위의 진짜 identity text diff로 확장한다.
