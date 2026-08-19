import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD, CARD_HEIGHT, MAX_CARD_WIDTH, SELECTED_SCALE, connectionPath, nodeWidthFor } from './constellationGeometry'

const BOX = { width: 720, height: 470 }

function endpointsOf(d: string) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return {
    start: { x: nums[0], y: nums[1] },
    end: { x: nums[nums.length - 2], y: nums[nums.length - 1] },
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 궤도에 N개를 균등 배치했을 때 i번째 노드의 정규화 좌표 */
function orbitNode(index: number, count: number, radius = 0.34) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius }
}

describe('connectionPath', () => {
  it('never reverses an edge, however close the two nodes are', () => {
    // 궤도 노드가 많아질수록 이웃 간 거리는 카드 크기보다 훨씬 짧아진다.
    for (const count of [4, 8, 12, 16, 24]) {
      for (let i = 0; i < count; i++) {
        const from = orbitNode(i, count)
        const to = orbitNode((i + 1) % count, count)
        const d = connectionPath(from, to, BOX)
        if (!d) continue

        const { start, end } = endpointsOf(d)
        const a = { x: from.x * BOX.width, y: from.y * BOX.height }
        const b = { x: to.x * BOX.width, y: to.y * BOX.height }

        expect(
          distance(start, a),
          `궤도 ${count}개 중 ${i}번: 시작점이 출발 노드보다 도착 노드에 더 가깝다 (d="${d}")`,
        ).toBeLessThan(distance(start, b))
        expect(
          distance(end, b),
          `궤도 ${count}개 중 ${i}번: 끝점이 도착 노드보다 출발 노드에 더 가깝다 (d="${d}")`,
        ).toBeLessThan(distance(end, a))
      }
    }
  })

  it('emits a quadratic curve rather than a cubic with two identical control points', () => {
    const d = connectionPath({ x: 0.5, y: 0.5 }, { x: 0.84, y: 0.5 }, BOX)!
    expect(d).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/)
  })

  it('returns null for a degenerate edge between two identical positions', () => {
    expect(connectionPath({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, BOX)).toBeNull()
  })

  it('places endpoints on the card boundary, not at the node centre', () => {
    const from = { x: 0.5, y: 0.5 }
    const to = { x: 0.84, y: 0.5 }
    const { start } = endpointsOf(connectionPath(from, to, BOX)!)
    const centre = { x: from.x * BOX.width, y: from.y * BOX.height }
    expect(distance(start, centre)).toBeGreaterThanOrEqual(DEFAULT_CARD.width / 2)
  })
})

describe('nodeWidthFor', () => {
  /** 궤도에 count개를 균등 배치했을 때 이웃 노드 사이의 최소 가로 간격(px) */
  function minAdjacentGap(box: { width: number; height: number }, count: number, radius = 0.34) {
    const points = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      return { x: (0.5 + Math.cos(angle) * radius) * box.width, y: (0.5 + Math.sin(angle) * radius) * box.height }
    })
    let gap = Infinity
    for (let i = 0; i < count; i++) {
      const a = points[i]
      const b = points[(i + 1) % count]
      // 세로로 충분히 떨어져 있으면 가로 간격은 제약이 아니다
      if (Math.abs(a.y - b.y) >= CARD_HEIGHT * SELECTED_SCALE) continue
      gap = Math.min(gap, Math.abs(a.x - b.x))
    }
    return gap
  }

  it.each([
    [520, 470, 8],
    [597, 470, 8],
    [720, 470, 8],
    [1100, 470, 8],
    [597, 470, 12],
    [597, 470, 16],
  ])('keeps cards clear of each other at %ix%i with %i orbit nodes', (width, height, count) => {
    const box = { width, height }
    const cardWidth = nodeWidthFor(box, count)

    expect(cardWidth).toBeGreaterThan(0)
    expect(cardWidth).toBeLessThanOrEqual(MAX_CARD_WIDTH)

    // 선택된 카드는 1.04배로 커진다 — 그 상태에서도 이웃과 겹치면 안 된다.
    expect(
      cardWidth * SELECTED_SCALE,
      `${width}x${height} / ${count}개에서 카드 폭 ${cardWidth}px 는 이웃 간격 ${minAdjacentGap(box, count).toFixed(0)}px 를 넘는다`,
    ).toBeLessThanOrEqual(minAdjacentGap(box, count))
  })

  it('never lets a card hang outside the container', () => {
    for (const width of [520, 597, 720, 1100]) {
      const box = { width, height: 470 }
      const cardWidth = nodeWidthFor(box, 8)
      const rightMostCentre = (0.5 + 0.34) * width
      expect(
        rightMostCentre + (cardWidth * SELECTED_SCALE) / 2,
        `폭 ${width}px 에서 오른쪽 노드가 컨테이너 밖으로 나간다`,
      ).toBeLessThanOrEqual(width)
    }
  })
})
