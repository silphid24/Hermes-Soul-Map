---
title: Soul Diff / Identity Drift — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Soul Diff / Identity Drift

## 구현 요약

- `src/domain/identityDrift.ts` 추가.
- `identityDrift(agent, snapshots)`로 과거 baseline snapshot 대비 현재 Agent의 drift 계산.
- Agent Detail에 `Soul Diff / Identity Drift` 카드 추가.
- README 구조/검증 수치 갱신.

## TDD 기록

1. `src/domain/identityDrift.test.ts` 작성.
2. RED 확인:
   - `Failed to resolve import "./identityDrift"` — 구현 파일 없음으로 실패.
3. `src/domain/identityDrift.ts` 구현.
4. GREEN 확인:
   - identityDrift 테스트 4개 통과.

## 검증 결과

```bash
npm test -- --run
# 8 files passed, 82 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```

## 남은 리스크

- 현재 drift는 `EvolutionSnapshot`의 제한된 지표(level/memory/skill/autonomy)와 현재 Agent 상태를 비교한다.
- 진짜 identity text diff(과거 identity 문장 대비 현재 identity 문장)는 export v3에서 historical soul snapshot이 생기면 확장 가능.
