export interface Point {
  x: number
  y: number
}

export interface Box {
  width: number
  height: number
}

export interface CardSize {
  width: number
  height: number
}

/** `.agent-node`의 최대 폭(px). 좁은 컨테이너에서는 이보다 줄어든다. */
export const MAX_CARD_WIDTH = 164

/**
 * `.agent-node`의 고정 높이(px). CSS에서 높이를 고정하고 설명을 두 줄로 자르기 때문에
 * 텍스트 길이와 무관하게 이 값이 성립한다 — 배치 계산이 렌더 결과를 추측하지 않아도 된다.
 *
 * 이 값이 근수평 이웃 쌍의 세로 간격(0.24 * height)보다 크면 그 쌍의 좁은 가로 간격이
 * 카드 폭의 상한이 되어 카드가 못 쓸 만큼 좁아진다. 높이를 먼저 억제해야 폭이 확보된다.
 */
export const CARD_HEIGHT = 108

/** 선택된 카드는 이만큼 확대된다 (`.agent-node.selected`). */
export const SELECTED_SCALE = 1.04

/** 별자리 궤도 반지름 (정규화). `buildConstellation()`과 같은 값이어야 한다. */
const ORBIT_RADIUS = 0.34

/** `.agent-node`의 렌더 크기(px). 연결선은 이 카드 밖에서 시작하고 끝나야 화살촉이 보인다. */
export const DEFAULT_CARD: CardSize = { width: MAX_CARD_WIDTH, height: CARD_HEIGHT }

/**
 * 측정된 컨테이너에서 이웃 노드와 겹치지 않는 카드 폭을 구한다.
 *
 * 카드 크기를 고정해 두면 컨테이너가 좁아질 때 반드시 겹친다. 반지름을 키워도 해결되지
 * 않는다 — 이웃 간격은 폭에 비례해 늘지만 동시에 바깥 노드가 컨테이너를 벗어난다.
 * 그래서 배치가 아니라 카드를 줄인다.
 */
export function nodeWidthFor(box: Box, orbitCount: number): number {
  const points = Array.from({ length: Math.max(orbitCount, 1) }, (_, index) => {
    const angle = (index / Math.max(orbitCount, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      x: (0.5 + Math.cos(angle) * ORBIT_RADIUS) * box.width,
      y: (0.5 + Math.sin(angle) * ORBIT_RADIUS) * box.height,
    }
  })

  let limit = MAX_CARD_WIDTH * SELECTED_SCALE

  // 세로로 카드 높이만큼 떨어지지 않은 이웃끼리는 가로 간격이 곧 상한이다.
  for (let index = 0; index < points.length; index++) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    if (Math.abs(a.y - b.y) >= CARD_HEIGHT * SELECTED_SCALE) continue
    limit = Math.min(limit, Math.abs(a.x - b.x))
  }

  // 가장 바깥 노드가 컨테이너를 벗어나지 않아야 한다.
  const rightMostCentre = (0.5 + ORBIT_RADIUS) * box.width
  limit = Math.min(limit, (box.width - rightMostCentre) * 2)

  return Math.max(1, Math.floor(limit / SELECTED_SCALE))
}

/** 카드 경계에서 추가로 띄우는 여백(px). */
const GAP = 6

/** 직선으로 이었을 때 최소한 이만큼은 보여야 화살표로 읽힌다(px). */
const MIN_SPAN = 28

/** 중심에서 방향 (ux, uy)로 나갈 때 카드 사각형과 만나는 거리 */
function boundaryDistance(ux: number, uy: number, card: CardSize): number {
  const toVerticalEdge = Math.abs(ux) > 1e-6 ? card.width / 2 / Math.abs(ux) : Infinity
  const toHorizontalEdge = Math.abs(uy) > 1e-6 ? card.height / 2 / Math.abs(uy) : Infinity
  return Math.min(toVerticalEdge, toHorizontalEdge)
}

function curve(start: Point, control: Point, end: Point): string {
  return (
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ` +
    `Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  )
}

/**
 * 정규화 좌표(0–1)로 배치된 두 노드를 잇는 곡선을 컨테이너 픽셀 좌표계로 그린다.
 *
 * 노드 버튼은 `left: x*100%` / `top: y*100%`로 배치되므로,
 * 연결선도 같은 픽셀 공간에서 계산해야 노드 위에 정확히 얹힌다.
 *
 * 두 카드가 가까워 직선으로는 보일 만한 길이가 나오지 않으면
 * 바깥쪽으로 크게 돌아가는 호로 우회한다 — 연결을 조용히 감추지 않기 위해서다.
 */
export function connectionPath(
  from: Point,
  to: Point,
  box: Box,
  card: CardSize = DEFAULT_CARD,
): string | null {
  const a = { x: from.x * box.width, y: from.y * box.height }
  const b = { x: to.x * box.width, y: to.y * box.height }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null

  const ux = dx / length
  const uy = dy / length
  const startOffset = boundaryDistance(ux, uy, card) + GAP
  const endOffset = boundaryDistance(-ux, -uy, card) + GAP
  const span = length - startOffset - endOffset

  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

  // 바깥쪽(컨테이너 중심 반대편)을 향하는 법선
  let nx = -uy
  let ny = ux
  if (nx * (mid.x - box.width / 2) + ny * (mid.y - box.height / 2) < 0) {
    nx = -nx
    ny = -ny
  }

  if (span >= MIN_SPAN) {
    const start = { x: a.x + ux * startOffset, y: a.y + uy * startOffset }
    const end = { x: b.x - ux * endOffset, y: b.y - uy * endOffset }
    const bow = Math.min(16, Math.max(4, span * 0.09))
    return curve(start, { x: (start.x + end.x) / 2 + nx * bow, y: (start.y + end.y) / 2 + ny * bow }, end)
  }

  // 우회 경로: 두 카드를 바깥쪽 법선 방향으로 수직으로 떠난 뒤 크게 돌아 만난다.
  // 수직으로 떠나면 출발점은 언제나 자기 노드에 더 가깝다 — 노드가 아무리 붙어 있어도
  // 화살표가 뒤집히지 않는다(빗겨 떠나면 이웃 쪽으로 넘어갈 수 있다).
  const exitOffset = boundaryDistance(nx, ny, card) + GAP
  const start = { x: a.x + nx * exitOffset, y: a.y + ny * exitOffset }
  const end = { x: b.x + nx * exitOffset, y: b.y + ny * exitOffset }
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return null

  // 우회 호가 너무 크게 휘면 직선 연결보다 눈에 띄어 장식처럼 읽힌다.
  const bow = exitOffset * 0.55 + 8
  return curve(start, { x: mid.x + nx * bow, y: mid.y + ny * bow }, end)
}
