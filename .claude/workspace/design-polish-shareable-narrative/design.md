---
title: Design Polish + Shareable Narrative (T08)
status: approved
approval_basis: 소급 작성 — spec.md와 동일 근거. 독립 리뷰어 세션 없음.
approvals:
  backend: self_reviewed
  frontend: self_reviewed
  designer: self_reviewed
  security: self_reviewed
required_approvals: [backend, frontend, designer, security]
---

# Design — Design Polish + Shareable Narrative (T08)

## 1. 연결선 기하 — 정규화 공간에서 픽셀 공간으로

**문제.** `<svg viewBox="0 0 100 100">`는 기본 `preserveAspectRatio="xMidYMid meet"`로 정사각형이 아닌 컨테이너에서 균등 축소·중앙 정렬된다. 654×470 박스에서는 470×470으로 그려지고 좌우 92px 오프셋이 생긴다. 노드는 `left: x*100%`로 배치되므로 두 좌표계가 어긋난다.

**결정.** viewBox를 버리고 SVG user unit = CSS px로 둔다. 컨테이너를 `getBoundingClientRect`로 측정해(`useMeasuredBox`, `ResizeObserver`로 갱신) 정규화 좌표를 픽셀로 환산한다. 측정 전(0×0)에는 간선을 그리지 않는다.

**부수 변경.** stroke 단위가 viewBox 단위에서 px로 바뀌므로 `stroke-width: .42 → 2`, `stroke-dasharray: 2.4 1.8 → 11 8`.

```
src/domain/constellationGeometry.ts   (신규, 순수 함수)
  connectionPath(from, to, box, card) : string | null
```

## 2. 끝점은 카드 경계에 붙인다

노드 카드는 164×104px이고 `z-index: 2`, 불투명 배경이다. 중심에서 고정 오프셋(40px)만 띄우면 화살촉이 카드 밑에 깔린다.

**결정.** 진행 방향으로 카드 사각형과 만나는 거리를 계산하고 `GAP = 6px`를 더한다.

```
boundaryDistance(ux, uy, card) = min(halfW/|ux|, halfH/|uy|)
```

## 3. 짧은 간선은 호로 우회한다

궤도 인접 노드는 720×470 기준 164px 떨어져 있는데 양쪽 카드 경계 오프셋 합이 그보다 크다. 직선으로는 그릴 자리가 없어 13개 간선 중 3개가 사라졌다.

**결정.** 직선 스팬이 `MIN_SPAN = 28px` 미만이면 두 카드를 **바깥쪽 법선 방향으로 수직으로** 떠나 크게 돌아가는 2차 베지어로 우회한다.

수직 출발을 택한 이유: 출발점의 자기 노드까지 거리는 `offset`, 상대 노드까지 거리는 `hypot(length, offset)`이므로 **항상** 자기 노드에 더 가깝다 — 노드가 아무리 붙어 있어도 화살표가 뒤집히지 않는다. 60°처럼 비스듬히 떠나면 12개 배치에서 실제로 뒤집혔다.

## 4. 화살촉 마커

- `.edges path`(특이도 0,1,1)가 `<defs>` 안 `.edge-arrowhead`(0,1,0)까지 잡아 `fill: none`으로 덮었다 → `.edges > path`로 직계 자식에만 한정.
- 시작 화살촉은 별도 마커 `#agent-arrowhead-start`(`orient="auto-start-reverse"`)를 쓴다. 같은 마커를 재사용하면 양방향 간선의 두 화살촉이 같은 방향을 가리킨다.

## 5. 선택은 감추지 말고 강조한다

`visibleEdges` 필터가 선택/코어에 닿지 않는 간선을 조용히 버렸다(13개 중 8개만 렌더). 또 `kind === 'default'` 에이전트가 없는 import에서는 `coreId`가 undefined가 되어 그래프가 붕괴했다.

**결정.** 필터를 제거하고 전부 렌더한다. 선택 에이전트에 닿는 간선은 `.focused`(opacity 1, 굵게), 나머지는 `.faded`(opacity .3). `coreId` 의존은 사라졌다.

## 6. 방사형 배치의 최소 폭

카드 164×104, 궤도 8개, 반지름 0.34 기준 겹침 여유:

| 폭 | 여유 |
|---:|---:|
| 654px (현재 데스크톱) | **-6.8px** (겹침) |
| 520px (그리드 컬럼 최소) | **-39px** |
| 690px | +1.9px |
| 720px | +9.0px |

**결정.** `.constellation { min-width: 720px }` + `.constellation-panel { overflow-x: auto }`. 겹쳐서 못 읽는 것보다 패널 안에서 가로로 스크롤하는 편이 낫다. 크기 선언은 리스킨 블록의 `.constellation` 한 곳으로 통합한다(기존에는 base와 `.trading-main .constellation` 두 곳에 흩어져 앞쪽이 죽은 코드였다).

## 7. autonomy 막대

레일 높이 132px − 패딩 24px = 108px 안에서 막대 높이를 `${autonomy}%`로 잡고 `max-height: 72px`로 잘랐다. 결과적으로 autonomy 약 67% 이상이 전부 같은 높이가 됐다.

**결정.** 막대를 `.bar-track { height: 72px }` 안에 넣어 퍼센트가 트랙 기준으로 해석되게 하고 `max-height`를 없앤다. 라벨 공간(36px)은 그대로 남고 전 범위가 구분된다. 컬럼 선택자는 `.evolution-rail div → .evolution-rail > div`로 좁힌다.

## 8. 모바일 그리드

`.agent-detail { grid-column: 2 }`가 무조건 선언돼 ≤980px 1열 그리드에서도 유지됐다 → 암묵적 2열이 생겨 문서가 가로로 넘쳤다. 미디어쿼리에서 `grid-column/grid-row: auto`로 되돌리고 `max-height: none`을 준다.

## 9. 시각 계약 테스트 재설계

**문제.** `App.css` 원문을 정규식으로 훑는 방식은 선언 순서만 바꿔도 실패하고(실제로 재현함), 위의 모든 시각 버그는 통과시켰다.

**결정.** 두 개의 테스트 유틸리티를 둔다.

```
src/test/layoutBox.ts   — jsdom에 렌더 박스를 주입 (레이아웃 엔진 부재 보완)
src/test/cssModel.ts    — CSS 캐스케이드 모델
    parseCssRules()             소스 순서 보존 (@media 포함)
    specificity()               [id, class, type]
    resolveDeclaredValue()      승자 계산 (선택자 매칭은 jsdom의 Element.matches)
    matchingRules()             진단용
    establishesStackingContext()/stackingContextOf()
```

선택자 매칭을 직접 구현하지 않고 jsdom(nwsapi)에 맡긴 것이 핵심이다. 직접 계산하는 건 특이도와 소스 순서뿐이다.

## 10. 생성 산출물

`src/data/projectActivity.ts`는 `predev`/`prebuild`/`pretest`가 로컬 `~/.hermes`와 파일 mtime으로 매번 다시 쓴다. 추적 상태로 두면 테스트만 돌려도 워킹트리가 더러워지고 머신 고유 활동 기록이 커밋된다.

**결정.** `.gitignore`에 추가하고 `git rm --cached`. 생성기에 fallback이 있고 세 훅이 항상 먼저 돌기 때문에 dev/build/test 경로는 모두 안전하다.

## 데이터 흐름

```
Agent[]
  └─ buildConstellation()  → GraphNode[] (정규화 0–1)
  └─ buildEdges()          → GraphEdge[] (중복 제거, mutual 병합)
        │
        ▼
  useMeasuredBox() ─ getBoundingClientRect ─▶ Box{width,height} (px)
        │
        ▼
  connectionPath(node, node, box, card) → "M .. Q .. .." | null
        │
        ▼
  <svg class="edges">  (viewBox 없음, user unit = px)
```

## 테스트 계획

| 대상 | 파일 | 방식 |
|---|---|---|
| 좌표 기하 | `src/domain/constellationGeometry.test.ts` | 순수 함수 단위 (역방향, 퇴화, 곡선 커맨드, 경계 배치) |
| 렌더 통합 | `src/App.constellationGeometry.test.tsx` | 박스 주입 + DOM 좌표 대조 |
| CSS 캐스케이드 | `src/App.cssCascade.test.tsx` | 해석기 자체 검증 + 화살촉 fill + 죽은 선언 |
| 반응형 | `src/App.responsiveLayout.test.tsx` | 1열 배치, 죽은 @media 오버라이드 탐지 |
| 차트 인코딩 | `src/App.evolutionRail.test.tsx` | 전 에이전트 순회, 높이 충돌 검출 |
| z-index | `src/App.stackingContext.test.tsx` | 스택 컨텍스트 모델링 |
| 제목/접근성 | `src/App.headings.test.tsx` | 중복 렌더, aria-labelledby |
| 저장소 위생 | `src/data/projectActivity.generated.test.ts` | git ls-files / check-ignore |

## Reviews

- **backend (self_reviewed)** — 기하 계산은 `src/domain/`의 순수 함수로 분리했다. React 의존 없음. 도메인 규칙(간선 중복 제거)은 `network.ts`에 그대로 두고 렌더 좌표만 새 모듈이 맡는다.
- **frontend (self_reviewed)** — `useMeasuredBox`는 `useLayoutEffect`로 초기 측정하고 `ResizeObserver`가 없는 환경(jsdom)에서는 조용히 건너뛴다. 측정 전에는 간선을 렌더하지 않아 잘못된 좌표가 한 프레임도 보이지 않는다.
- **designer (self_reviewed)** — 간선을 감추지 않고 흐리게 두는 결정, 최소 폭 720px + 가로 스크롤 결정에 동의. 모바일 전용 레이아웃 재설계는 별도 과제로 남긴다.
- **security (self_reviewed)** — 생성 산출물 추적 해제로 로컬 활동 기록 유출 경로를 닫았다. 새 코드에 네트워크·파일시스템 접근 없음. 테스트 유틸이 `git`을 호출하지만 읽기 전용(`ls-files`, `check-ignore`)이며 `.git` 부재 시 건너뛴다.
