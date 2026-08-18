import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from './App'
import { loadSeed } from './data/source'
import { buildEdges } from './domain/network'
import { CARD_HEIGHT, nodeWidthFor } from './domain/constellationGeometry'
import { useFakeElementBox } from './test/layoutBox'
import { parseCssRules, resolveDeclaredValue } from './test/cssModel'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cssRules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

/**
 * 별자리 패널의 실제 렌더 박스는 정사각형이 아니다.
 * 폭은 CSS의 min-width(720px) 아래로 내려갈 수 없고, 높이는 470px로 고정된다.
 */
const BOX = { width: 720, height: 470 }

interface Point { x: number; y: number }

/** path의 d에서 첫 좌표(시작점)와 마지막 좌표(끝점)를 뽑는다. 커맨드 종류에 의존하지 않는다. */
function endpointsOf(d: string): { start: Point; end: Point } {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  expect(nums.length).toBeGreaterThanOrEqual(4)
  return {
    start: { x: nums[0], y: nums[1] },
    end: { x: nums[nums.length - 2], y: nums[nums.length - 1] },
  }
}

/** 노드 버튼의 left/top 퍼센트를 컨테이너 픽셀 중심 좌표로 환산한다. */
function nodeCentersPx(constellation: HTMLElement): Point[] {
  return Array.from(constellation.querySelectorAll<HTMLElement>('.agent-node')).map((node) => ({
    x: (parseFloat(node.style.left) / 100) * BOX.width,
    y: (parseFloat(node.style.top) / 100) * BOX.height,
  }))
}

/** 중심에서 방향 d로 나갈 때 카드 사각형과 만나는 거리 (사각형 경계의 기하 정의) */
function cardBoundary(dx: number, dy: number, card: { width: number; height: number }): number {
  const length = Math.hypot(dx, dy) || 1
  const ux = Math.abs(dx / length)
  const uy = Math.abs(dy / length)
  return Math.min(
    ux > 1e-6 ? card.width / 2 / ux : Infinity,
    uy > 1e-6 ? card.height / 2 / uy : Infinity,
  )
}

/**
 * 끝점이 어느 노드의 카드 경계에 붙어 있는지 찾는다.
 * 카드 밖이면서 경계에서 tolerance 이내여야 "그 노드에 꽂힌" 화살표다.
 */
function anchorNode(point: Point, centers: Point[], card: { width: number; height: number }, tolerance = 14): number {
  return centers.findIndex((center) => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const overhang = Math.hypot(dx, dy) - cardBoundary(dx, dy, card)
    return overhang >= 0 && overhang <= tolerance
  })
}

/**
 * 점이 노드 카드 안에 갇혀 있으면 true — 그 자리에 그려진 화살촉은 카드에 가려진다.
 * 경계에 정확히 얹힌 점은 가려진 것이 아니므로 1px 여유를 둔다 (부동소수점 오차 포함).
 */
const EDGE_TOLERANCE = 1

function insideCard(point: Point, center: Point, card: { width: number; height: number }): boolean {
  return (
    Math.abs(point.x - center.x) < card.width / 2 - EDGE_TOLERANCE &&
    Math.abs(point.y - center.y) < card.height / 2 - EDGE_TOLERANCE
  )
}

/**
 * 카드 크기는 CSS 상수가 아니라 측정된 컨테이너에서 계산된다.
 * 테스트도 같은 출처를 써야 렌더 결과와 어긋나지 않는다.
 */
function cardSizeFor(surface: HTMLElement, box = BOX) {
  const orbitCount = surface.querySelectorAll('.agent-node').length - 1
  return { width: nodeWidthFor(box, orbitCount), height: CARD_HEIGHT }
}

describe('constellation connection geometry', () => {
  useFakeElementBox({ constellation: BOX })

  it('anchors both ends of every connection on the card edge of two different nodes', () => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const surface = constellation.querySelector<HTMLElement>('.constellation')!
    const card = cardSizeFor(surface)
    const centers = nodeCentersPx(surface)
    expect(centers.length).toBeGreaterThan(1)

    const connections = within(constellation).getAllByTestId('agent-connection')
    expect(connections.length).toBeGreaterThan(0)

    for (const connection of connections) {
      const d = connection.getAttribute('d') ?? ''
      const { start, end } = endpointsOf(d)
      const startNode = anchorNode(start, centers, card)
      const endNode = anchorNode(end, centers, card)

      const describe = (point: Point) => `(${point.x.toFixed(0)}, ${point.y.toFixed(0)})`
      expect(
        startNode,
        `시작점 ${describe(start)} 이 어떤 노드 카드에도 붙어 있지 않음. d="${d}", ` +
          `노드 중심(px): ${JSON.stringify(centers.map((c) => [Math.round(c.x), Math.round(c.y)]))}`,
      ).toBeGreaterThanOrEqual(0)
      expect(endNode, `끝점 ${describe(end)} 이 어떤 노드 카드에도 붙어 있지 않음. d="${d}"`).toBeGreaterThanOrEqual(0)
      expect(startNode, `연결선의 양 끝이 같은 노드에 붙어 있음. d="${d}"`).not.toBe(endNode)
    }
  })

  it('keeps both endpoints outside the node cards so the arrowheads are not hidden behind them', () => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const surface = constellation.querySelector<HTMLElement>('.constellation')!
    const card = cardSizeFor(surface)
    expect(card.width).toBeGreaterThan(0)
    expect(card.height).toBeGreaterThan(0)

    const centers = nodeCentersPx(surface)
    const connections = within(constellation).getAllByTestId('agent-connection')
    expect(connections.length).toBeGreaterThan(0)

    for (const connection of connections) {
      const d = connection.getAttribute('d') ?? ''
      const { start, end } = endpointsOf(d)
      for (const [name, point] of [['시작점', start], ['끝점', end]] as const) {
        const trapped = centers.find((center) => insideCard(point, center, card))
        expect(
          trapped,
          `${name} (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) 이 ${card.width}x${card.height} 카드 안에 갇혀 있음 — 화살촉이 카드 뒤로 숨는다`,
        ).toBeUndefined()
      }
    }
  })

  it('points the start arrowhead back at the source on mutual connections', () => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const connections = within(constellation).getAllByTestId('agent-connection')

    const mutual = connections.filter((path) => path.getAttribute('marker-start'))
    expect(mutual.length, '시드 데이터에 양방향 연결이 있어야 이 테스트가 의미를 가진다').toBeGreaterThan(0)

    for (const path of mutual) {
      const startRef = path.getAttribute('marker-start')!.replace(/^url\(#|\)$/g, '')
      const endRef = path.getAttribute('marker-end')!.replace(/^url\(#|\)$/g, '')
      const startMarker = constellation.querySelector(`#${startRef}`)
      const endMarker = constellation.querySelector(`#${endRef}`)
      expect(startMarker).not.toBeNull()
      expect(endMarker).not.toBeNull()

      // SVG에서 시작 마커는 진행 방향을 따르므로, 되돌아보게 하려면 auto-start-reverse가 필요하다.
      expect(startMarker!.getAttribute('orient')).toBe('auto-start-reverse')
      expect(endMarker!.getAttribute('orient')).toBe('auto')
    }
  })

  it.each([
    ['desktop', 1440],
    ['mobile', 390],
  ])('never overlaps two agent cards at its narrowest render width (%s)', (_label, viewportWidth) => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const surface = constellation.querySelector<HTMLElement>('.constellation')!
    const sampleNode = surface.querySelector<HTMLElement>('.agent-node')!

    // 이 컨테이너가 가질 수 있는 가장 좁은 폭 — min-width가 없으면 실제 측정 폭까지 줄어든다.
    const declaredMinWidth = parseFloat(resolveDeclaredValue(surface, 'min-width', cssRules, { viewportWidth }) ?? '')
    const width = Number.isNaN(declaredMinWidth) ? BOX.width : declaredMinWidth
    const height = parseFloat(resolveDeclaredValue(surface, 'height', cssRules, { viewportWidth }) ?? '')
    expect(height).toBeGreaterThan(0)

    const card = {
      width: parseFloat(resolveDeclaredValue(sampleNode, 'width', cssRules, { viewportWidth }) ?? ''),
      height: parseFloat(resolveDeclaredValue(sampleNode, 'min-height', cssRules, { viewportWidth }) ?? ''),
    }

    const centers = Array.from(surface.querySelectorAll<HTMLElement>('.agent-node')).map((node) => ({
      x: (parseFloat(node.style.left) / 100) * width,
      y: (parseFloat(node.style.top) / 100) * height,
      label: node.textContent?.slice(0, 18) ?? '',
    }))

    const overlaps: string[] = []
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const dx = Math.abs(centers[i].x - centers[j].x)
        const dy = Math.abs(centers[i].y - centers[j].y)
        if (dx < card.width && dy < card.height) {
          overlaps.push(
            `${centers[i].label} ↔ ${centers[j].label}: dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} ` +
              `(카드 ${card.width}x${card.height})`,
          )
        }
      }
    }

    expect(
      overlaps,
      `${width}x${height} 컨테이너에서 카드가 서로 겹친다:\n${overlaps.join('\n')}`,
    ).toEqual([])
  })

  it('renders every relationship in the graph, not only the ones touching the selected or core agent', () => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const connections = within(constellation).getAllByTestId('agent-connection')

    const edges = buildEdges(loadSeed().agents)
    expect(
      connections.length,
      `그래프에는 연결이 ${edges.length}개인데 ${connections.length}개만 그려졌다 — ` +
        `나머지는 아무 안내도 없이 사라져 사용자는 그 에이전트들이 서로 무관하다고 읽는다`,
    ).toBe(edges.length)
  })
})
