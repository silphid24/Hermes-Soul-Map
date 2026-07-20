---
title: Soul Diff / Identity Drift
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, frontend, security, designer]
---

# Design — Soul Diff / Identity Drift

## Domain

신규 `src/domain/identityDrift.ts`:

```ts
export function identityDrift(agent: Agent, snapshots: EvolutionSnapshot[]): IdentityDriftSummary
```

## 계산 규칙

- snapshot은 date 오름차순 정렬.
- baseline = 첫 스냅샷, latest = 마지막 스냅샷.
- delta:
  - autonomy: `agent.autonomy - baseline.autonomy`
  - memory: `agent.memory.longTerm - baseline.memoryCount`
  - skill: `agent.skills.length - baseline.skillCount`
  - level: `latest.level - baseline.level`
- status:
  - snapshot 없음 → `unknown`
  - autonomy delta < 0 → `regressing`
  - autonomy/memory/skill/level 중 의미 있는 증가 → `growing`
  - snapshot 1개 → `emerging`
  - 그 외 → `stable`

## UI

`AgentDetail`의 `Soul / Identity` 아래에 `Soul Diff / Identity Drift` 카드 추가.

- 상태 badge
- 현재 identity
- 4개 delta metric
- drift badge chips
- narrative

## 안전성

- 순수 함수, throw 금지.
- 실제 파일/개인 데이터 직접 읽지 않음.
