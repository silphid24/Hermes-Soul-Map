---
title: Soul History Snapshot — Identity Text Diff
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Soul History Snapshot

## 목표

2번 Soul Diff를 한 단계 더 진행해, 숫자 drift뿐 아니라 **과거 identity/tone/mood/values/coherence 스냅샷 대비 현재 soul 변화**를 표시한다.

## 요구사항

- `SoulSnapshot` 타입 추가.
- `SoulMapData.soulHistory` 추가.
- `HermesExport.soulSnapshots` optional import 지원.
- `identityDrift(agent, evolution, soulHistory)`가 다음을 계산:
  - identity changed 여부
  - values added/removed
  - tone changed 여부
  - mood changed 여부
  - coherence delta
- UI Soul Diff 카드에 soul text diff 섹션 표시.
- 하위 호환: 기존 export/seed가 soulHistory 없어도 동작.

## Acceptance Criteria

- TDD RED/GREEN 기록.
- `npm test -- --run`, `npm run lint`, `npm run build` 통과.
