---
title: Live Export v2 — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Live Export v2

## 구현 요약

- `HermesExport` v2 optional 필드 추가:
  - `evolutionSnapshots`
  - `requests`
  - `roadmap`
  - `sourceHealth`
- `mapHermesExportToSoulMap()`가 v2 필드를 `SoulMapData.evolution / requests / roadmap`으로 안전 매핑.
- `deriveSourceHealth()` 추가: 세션·기억·스킬·크론·플로우로그 채널 상태를 계산/정규화.
- UI 상단에 `Source Health` 패널 추가.
- seed/imported 모드 배지를 hero nav에 표시.
- v2 샘플 export와 README 문서 갱신.

## 변경 파일

- `src/data/hermesExport.ts`
- `src/data/hermesExport.test.ts`
- `src/App.tsx`
- `src/App.css`
- `examples/hermes-export.sample.json`
- `README.md`
- `.claude/workspace/live-export-v2/spec.md`
- `.claude/workspace/live-export-v2/design.md`
- `.claude/workspace/live-export-v2/implementation.md`

## 검증 결과

```bash
npm test -- --run
# 6 files passed, 73 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```

## 런타임 확인

```bash
npm run dev -- --host 127.0.0.1 --port 5177
# HTTP GET / returned 200
```

## QA Review

### qa — 2026-07-16
**결정**: approved

**확인 항목**:
- v1 import 하위 호환 유지.
- v2 optional 배열이 잘못된 타입이어도 validate는 통과하고 mapper가 빈 배열로 안전 수렴.
- evolution skip/fallback 규칙 테스트 통과.
- requests status/priority fallback 테스트 통과.
- roadmap phase/done strict boolean fallback 테스트 통과.
- sourceHealth 자동 판정 및 제공값 clamp 테스트 통과.
- lint/build 통과.

**남은 리스크**:
- 브라우저 E2E 자동화는 아직 없음. 현재는 빌드 + dev server 200 응답까지 확인.
- 실제 Hermes 파일/DB export generator는 다음 사이클 범위.
