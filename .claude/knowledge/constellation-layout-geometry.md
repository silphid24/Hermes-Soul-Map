# Agent Constellation 배치 기하

확정일: 2026-08-18 (T08)

## 배치 규칙

`buildConstellation()` — `kind === 'default'` 에이전트는 중앙 (0.5, 0.5), 나머지는 반지름 **0.34**의 원 위에 12시부터 시계방향 균등 배치. 좌표는 0–1 정규화이며 `left: x*100%` / `top: y*100%`로 렌더된다.

## 왜 `min-width: 720px`인가

카드 164×104px, 궤도 8개, 반지름 0.34 기준 인접 노드 겹침 여유:

| 컨테이너 폭 | 여유 |
|---:|---:|
| 520px (그리드 컬럼 최소) | **-39px** |
| 654px (실제 데스크톱) | **-6.8px** |
| 690px | +1.9px |
| **720px** | **+9.0px** |

**데스크톱에서도 겹치고 있었다.** 반지름을 키우는 것으로는 해결되지 않는다 — 45° 인접 쌍의 수평 간격은 `W · r · sin45°`라 폭에 비례하는데, 반지름을 키우면 동시에 동/서 노드가 컨테이너 밖으로 나간다. 520px 폭에서는 어떤 반지름으로도 164px 카드가 들어가지 않는다.

그래서 **폭에 하한을 두고 좁아지면 패널 안에서 가로 스크롤**한다. `.constellation { min-width: 720px }` + `.constellation-panel { overflow-x: auto; overflow-y: hidden }`.

크기 선언(`height`, `min-width`, `background`)은 리스킨 블록의 `.constellation` **한 곳**에만 둔다. 예전에는 base와 `.trading-main .constellation` 두 곳에 흩어져 앞쪽이 죽은 코드였다.

## 연결선

`connectionPath(from, to, box, card)` — `src/domain/constellationGeometry.ts`

- **픽셀 공간에서 계산한다.** SVG에 `viewBox`를 두지 않고 user unit = CSS px. 컨테이너는 `useMeasuredBox`가 `getBoundingClientRect` + `ResizeObserver`로 측정한다. 측정 전(0×0)에는 간선을 렌더하지 않는다.
- **끝점은 카드 경계 + `GAP = 6px`.** 방향 `(ux, uy)`에 대해 `min(halfW/|ux|, halfH/|uy|)`. 중심 기준 고정 오프셋을 쓰면 화살촉이 불투명한 카드(z-index 2) 뒤로 숨는다.
- **직선 스팬 < `MIN_SPAN = 28px`이면 호로 우회한다.** 궤도 인접 노드는 720×470 기준 164px 떨어져 있는데 양쪽 오프셋 합이 그보다 커서, 우회가 없으면 13개 중 3개가 사라진다.
- **우회는 바깥쪽 법선으로 수직 출발.** 출발점의 자기 노드까지 거리는 `offset`, 상대까지는 `hypot(length, offset)`이므로 **항상** 자기 노드에 더 가깝다 → 화살표가 절대 뒤집히지 않는다. 60°처럼 비스듬히 떠나면 궤도 12개 배치에서 실제로 뒤집혔다.
- 곡선은 2차 베지어(`Q`). 제어점이 같은 3차(`C c c e`)는 같은 곡선을 두 배 길이로 쓰는 것이다.

## 마커

- `.edges > path` — **직계 자식으로 한정해야 한다.** `.edges path`로 두면 `<defs><marker>` 안의 화살촉까지 잡아 `fill: none`으로 덮는다.
- 시작 화살촉은 별도 마커 `#agent-arrowhead-start` (`orient="auto-start-reverse"`). 같은 마커를 재사용하면 양방향 간선의 두 화살촉이 같은 방향을 가리킨다.
- stroke 단위는 픽셀이다 (`stroke-width: 2`). viewBox 시절의 `.42`를 그대로 두면 1px 미만으로 보이지 않는다.

## 선택 동작

간선을 **필터링해 감추지 않는다.** `buildEdges()`가 낸 전부를 렌더하고, 선택 에이전트에 닿는 것은 `.focused`, 나머지는 `.faded`(opacity .3).

예전에는 선택/코어에 닿는 간선만 렌더해 13개 중 8개만 보였고, 사용자는 나머지 에이전트들이 서로 무관하다고 읽었다. 게다가 `kind === 'default'` 에이전트가 없는 import에서는 `coreId`가 undefined가 되어 그래프가 붕괴했다.

## 관련

- `.claude/knowledge/visual-contract-testing.md`
- `src/domain/constellationGeometry.ts`, `src/domain/network.ts`
