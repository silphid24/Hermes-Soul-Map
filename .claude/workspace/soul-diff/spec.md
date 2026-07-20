---
title: Soul Diff / Identity Drift
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Soul Diff / Identity Drift

## 목표

각 에이전트의 현재 정체성/능력이 과거 스냅샷 대비 어떻게 변했는지 `diff`처럼 보여준다. Soul Map을 단순 상태판이 아니라 **에이전트 성장/정체성 관측 도구**로 만든다.

## 요구사항

- `Agent` + 해당 에이전트의 `EvolutionSnapshot[]`에서 drift summary를 계산한다.
- 표시 항목:
  - drift 상태: `emerging | stable | growing | regressing | unknown`
  - autonomy delta
  - memory delta
  - skill delta
  - level delta
  - 현재 identity 한 줄
  - 변화 narrative
  - drift badges
- 스냅샷이 없으면 unknown 상태로 안전 표시.
- Agent Detail에 `Soul Diff / Identity Drift` 카드로 표시.
- seed/import 데이터 모두 동작.

## Acceptance Criteria

- 신규 도메인 테스트 RED → GREEN.
- UI에서 모든 에이전트 선택 시 카드가 표시됨.
- `npm test -- --run`, `npm run lint`, `npm run build` 통과.
