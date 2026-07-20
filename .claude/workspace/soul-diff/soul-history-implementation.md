---
title: Soul History Snapshot — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Soul History Snapshot

## 구현 요약

- `SoulSnapshot` 타입 추가.
- `SoulMapData.soulHistory` 추가.
- `HermesExport.soulSnapshots` optional import 지원.
- seed에 각 에이전트별 과거 soul baseline 추가.
- `identityDrift(agent, evolution, soulHistory)`가 text/value/tone/mood/coherence drift를 계산하도록 확장.
- UI Soul Diff 카드에 `Identity text diff` 섹션 추가.

## TDD 기록

1. `identityDrift.test.ts`에 soul text/value drift 테스트 추가.
2. RED 확인:
   - `summary.soulDelta`가 `undefined`로 실패.
3. `identityDrift.ts` 구현.
4. `hermesExport.test.ts`에 v3 `soulSnapshots` import 테스트 추가.
5. RED 확인:
   - `data.soulHistory`가 `undefined`로 실패.
6. `hermesExport.ts`, `types.ts`, `seed.ts`, `App.tsx`, `App.css` 구현.

## 최종 검증

```bash
npm test -- --run
# 8 files passed, 84 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```
