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

/** `.agent-node`의 렌더 크기(px). 연결선은 이 카드 밖에서 시작하고 끝나야 화살촉이 보인다. */
export const DEFAULT_CARD: CardSize = { width: 164, height: 104 }

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
    const bow = Math.min(24, Math.max(6, span * 0.12))
    return curve(start, { x: (start.x + end.x) / 2 + nx * bow, y: (start.y + end.y) / 2 + ny * bow }, end)
  }

  // 우회 경로: 두 카드를 바깥쪽 법선 방향으로 수직으로 떠난 뒤 크게 돌아 만난다.
  // 수직으로 떠나면 출발점은 언제나 자기 노드에 더 가깝다 — 노드가 아무리 붙어 있어도
  // 화살표가 뒤집히지 않는다(빗겨 떠나면 이웃 쪽으로 넘어갈 수 있다).
  const exitOffset = boundaryDistance(nx, ny, card) + GAP
  const start = { x: a.x + nx * exitOffset, y: a.y + ny * exitOffset }
  const end = { x: b.x + nx * exitOffset, y: b.y + ny * exitOffset }
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return null

  const bow = exitOffset + 20
  return curve(start, { x: mid.x + nx * bow, y: mid.y + ny * bow }, end)
}
