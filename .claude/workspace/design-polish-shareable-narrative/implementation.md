---
title: Design Polish + Shareable Narrative (T08)
status: approved
approval_basis: TDD 15 사이클 — 각 항목 RED 확인 후 GREEN. 독립 QA 세션 없음.
approvals:
  qa: self_reviewed
required_approvals: [qa]
---

# Implementation — Design Polish + Shareable Narrative (T08)

## 진행 방식

`/code-review xhigh` 지적 15건을 순서대로, 항목마다 **실패하는 테스트를 먼저 작성하고 실패를 눈으로 확인한 뒤** 최소 구현으로 넘어갔다. 테스트가 곧바로 통과하면 테스트가 틀린 것으로 보고 고쳤다(#6에서 실제로 발생 — 기본 선택 에이전트만으로는 클램프에 걸리지 않아 전 에이전트 순회로 넓혔다).

## 항목별 기록

| # | 지적 | RED 증거 | 수정 |
|---|---|---|---|
| 1 | viewBox 종횡비 불일치로 화살표가 노드에서 62px 어긋남 | `d="M 50.00 41.50 … 50.00 24.50"` vs 노드 중심 `[327,235],[549,235]` | `src/domain/constellationGeometry.ts` 신규 — 픽셀 공간 계산. `useMeasuredBox` 훅 추가, viewBox 제거 |
| 2 | `.edges path`가 marker 화살촉을 덮어 투명 삼각형 | `resolveDeclaredValue(arrowhead,'fill')` → `none` | `.edges > path`로 직계 자식 한정 |
| 3 | 끝점이 카드 뒤에 깔림 | 시작점 (327,195), 코어 중심 (327,235), 카드 반높이 52 | 카드 경계 거리 + `GAP=6` 기반 오프셋 |
| 4 | 양방향 간선 시작 화살촉이 정방향 | `orient` = `auto` | `#agent-arrowhead-start` (`auto-start-reverse`) 추가 |
| 5 | 모바일 1열 그리드에서 `grid-column: 2` 유지 → 가로 오버플로 | `.agent-detail` grid-column `2` @390px | ≤980px에서 `grid-column/grid-row: auto`, `max-height: none` |
| 6 | `max-height: 72px`가 autonomy ≥67%를 뭉갬 | AI Trend Radar 70%·84% 둘 다 72px | `.bar-track { height: 72px }` 도입, `max-height` 제거 |
| 7 | 죽은 `@media` 오버라이드 | `.constellation{height:680px}`, **추가 발견** `.app-shell{padding:14px}` | 두 선언 삭제 |
| 8 | 생성 파일이 추적돼 워킹트리 오염 | `git ls-files --error-unmatch` 성공 | `.gitignore` 추가 + `git rm --cached` |
| 9 | 간선 5개가 안내 없이 사라짐 | 13개 중 8개만 렌더 | 필터 제거, `.focused`/`.faded`로 강조 전환 |
| 10 | 짧은 간선에서 화살표 역방향 | 궤도 12개 배치에서 시작점이 상대 노드에 더 가까움 (88.7 vs 87.6) | 수직 출발 우회 호. `C`(제어점 중복) → `Q` |
| 11 | CSS 원문 정규식 테스트 | 선언 순서만 바꾼 no-op 편집으로 실패 재현 | `src/test/cssModel.ts` 캐스케이드 해석기로 전면 교체 |
| 12 | 라이프사이클 문서 누락 | — | 이 workspace 3종 + `.claude/knowledge/` 항목 |
| 13 | 크기 선언 이중 declaration | `.constellation{height:530px}` 사장, **추가 발견** `.constellation-panel` min-height 620/560 **둘 다** `.trading-main > .panel{min-height:0}`에 밀려 사장 | 크기 선언을 리스킨 블록 한 곳으로 통합, 죽은 선언 제거 |
| 14 | 죽은 z-index + 중복 배경 | 중복 `background: #0d1117` 확인 | 중복 배경 제거. **z-index 부분은 지적대로 성립하지 않음** — 아래 참조 |
| 15 | 제목 중복 + 지어낸 aria-label | 각 제목 2회 렌더, region 이름이 이중 언어 | 카드 내부 제목 제거, `aria-labelledby="delegation-replay-heading"` |

## 리뷰 지적 중 성립하지 않은 것

**#14의 z-index 부분.** "`.trading-main > .panel { contain: layout paint }`가 스택 컨텍스트를 만들어 `.constellation-panel`과 `.pipeline-strip`의 z-index가 상호작용할 수 없다"는 설명은 맞지 않는다. `contain`은 해당 엘리먼트 **자신**이 스택 컨텍스트를 만들게 할 뿐, 그 엘리먼트가 부모 컨텍스트에서 자기 z-index로 정렬되는 것은 그대로다. 스택 컨텍스트를 모델링해 검증한 결과 두 엘리먼트는 같은(루트) 컨텍스트에 속한다 — 구조적으로 죽은 선언이 아니다.

두 값이 지금 아무 것도 정렬하지 않는 것은 사실이지만(그리드 행이 달라 겹치지 않는다), 그건 레이아웃에 의존하는 판단이라 캐스케이드만으로는 증명할 수 없다. 실패하는 테스트를 만들 수 없으므로 선언은 그대로 두고, 대신 "같은 스택 컨텍스트에 겨룰 상대가 없는 z-index"를 잡는 회귀 가드를 남겼다(`src/App.stackingContext.test.tsx`). 이 가드는 처음부터 통과했으므로 결함을 잡아 만든 테스트가 아니라 향후 방지용이다.

## 리뷰가 놓쳐 테스트가 찾아낸 것

1. **데스크톱에서도 노드 카드가 겹친다.** 654px 폭에서 4쌍, 여유 -6.8px. 리뷰는 모바일만 지적했다. → `min-width: 720px` + 패널 가로 스크롤.
2. **`.app-shell { padding: 14px }`** 모바일 오버라이드가 `.trading-room-shell { padding: 0 }`에 밀려 무효.
3. **`.constellation-panel`의 min-height 620px·560px이 둘 다 무효.** `.trading-main > .panel { min-height: 0 }`이 특이도로 이긴다.
4. **스팬 3–5px짜리 사실상 보이지 않는 간선 조각.** 카드 경계 오프셋 합이 간선 길이에 육박할 때 발생.

## 변경 파일

**신규**
```
src/domain/constellationGeometry.ts        연결선 기하 (순수)
src/domain/constellationGeometry.test.ts   단위 테스트
src/test/cssModel.ts                       CSS 캐스케이드 모델 (테스트 유틸)
src/test/layoutBox.ts                      jsdom 렌더 박스 주입 (테스트 유틸)
src/App.constellationGeometry.test.tsx     렌더 통합 (좌표/겹침/전체 간선)
src/App.cssCascade.test.tsx                해석기 검증 + 화살촉 + 죽은 선언
src/App.responsiveLayout.test.tsx          1열 배치 + 죽은 @media 탐지
src/App.evolutionRail.test.tsx             autonomy 인코딩
src/App.stackingContext.test.tsx           z-index 회귀 가드
src/App.headings.test.tsx                  제목 중복 / 접근성 이름
src/data/projectActivity.generated.test.ts 저장소 위생
```

**수정**
```
src/App.tsx                       useMeasuredBox, viewBox 제거, 시작 마커, 필터 제거, bar-track, 제목/aria
src/App.css                       선택자 범위, px 단위, 모바일 배치, min-width, 죽은 선언 제거
src/App.tradingRoomDesign.test.tsx 정규식 → 캐스케이드 해석
.gitignore                        src/data/projectActivity.ts
```

**추적 해제**
```
src/data/projectActivity.ts       (파일은 그대로, git index에서만 제거)
```

## 검증

```
npm test -- --run   25 files / 232 tests passed
npm run lint        0 warnings, 0 errors
npm run build       passed (tsc -b + vite build)
git status          생성 파일이 더 이상 modified 로 나타나지 않음
```

## 남은 일

- `mobile/Telegram preview 고려` — 가로 오버플로와 카드 겹침은 해결했으나, 좁은 화면에서 별자리는 가로 스크롤로 본다. 모바일 전용 레이아웃(리스트/그리드)은 별도 과제.
- `design review B+ 이상` — 미실행.
- 기본 테마와 Trading Room 리스킨 사이에 사장된 선언이 약 30건 있다. 의도된 오버라이드 레이어라 이번 범위에서 제외했다.
