import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'
import { parseCssRules, resolveDeclaredValue } from './test/cssModel'

const rules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

/**
 * 선택자에 실제로 적용되는 선언 값을 캐스케이드로 계산해 돌려준다.
 * App.css 원문을 정규식으로 훑던 예전 방식과 달리 선언 순서·포맷에는 둔감하고,
 * 더 높은 특이도의 규칙에 밀려 죽은 선언은 잡아낸다.
 */
function declared(selector: string, property: string): string | undefined {
  const element = document.querySelector(selector)
  expect(element, `${selector} 가 렌더되지 않음`).not.toBeNull()
  return resolveDeclaredValue(element!, property, rules)
}

describe('Agent Soul Map terminal visual contract', () => {
  useFakeElementBox({ constellation: { width: 654, height: 470 } })

  it('renders Agent Soul Map as the product title while keeping dark terminal operations chrome', () => {
    render(<App />)

    const shell = screen.getByTestId('trading-room-shell')
    expect(shell).toHaveClass('trading-room-shell')

    const header = screen.getByRole('banner', { name: /Agent Soul Map Operations Room/i })
    expect(within(header).getByText('AGENT')).toBeInTheDocument()
    expect(within(header).getByText('SOUL MAP')).toBeInTheDocument()
    expect(within(header).getByRole('heading', { level: 1, name: 'Agent Soul Map' })).toBeInTheDocument()
    expect(within(header).queryByRole('heading', { level: 1, name: /MACADAMIA/i })).not.toBeInTheDocument()
    expect(within(header).getByText(/AGENT IDENTITY PIPELINE/i)).toBeInTheDocument()
    expect(within(header).getAllByText(/LIVE/i).length).toBeGreaterThan(0)
    expect(within(header).getByText(/COMPLETE/i)).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: /실행 기록/i })
    expect(within(sidebar).getByText(/현재 실행/i)).toBeInTheDocument()
    expect(within(sidebar).getAllByText(/ARCHIVE/i).length).toBeGreaterThan(0)

    expect(screen.getByRole('region', { name: /Agent Soul Map Pipeline Layers/i })).toBeInTheDocument()
    expect(screen.getByText(/LAYER 0/i)).toBeInTheDocument()
    expect(screen.getByText(/데이터 수집/i)).toBeInTheDocument()
    expect(screen.getAllByText(/⇉ 병렬/i).length).toBeGreaterThan(0)
  })

  it('compresses dense agent detail sections into expandable blocks to reduce page length', () => {
    render(<App />)

    const detail = screen.getByRole('region', { name: /Selected Agent Detail/i })
    expect(within(detail).getByText('Soul Diff / Identity Drift').closest('details')).toHaveAttribute('open')
    expect(within(detail).getByText('Agent Activity Blackbox').closest('details')).not.toHaveAttribute('open')
    expect(within(detail).getByText('Agent Runbook / Operating Manual').closest('details')).not.toHaveAttribute('open')
  })

  it('draws visible directional connection arrows inside the constellation panel', () => {
    render(<App />)

    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    expect(within(constellation).queryByText(/LAYER 0/i)).not.toBeInTheDocument()

    const connections = within(constellation).getAllByTestId('agent-connection')
    expect(connections.length).toBeGreaterThan(0)
    expect(connections[0].tagName.toLowerCase()).toBe('path')
    expect(connections[0]).toHaveAttribute('marker-end', 'url(#agent-arrowhead)')
  })

  it('places the pipeline in its own area outside the constellation/detail grid', () => {
    render(<App />)

    const pipeline = screen.getByRole('region', { name: /Agent Soul Map Pipeline Layers/i })
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    expect(pipeline.closest('.pipeline-zone')).not.toBeNull()
    expect(pipeline.closest('.trading-main')).toBeNull()
    expect(constellation.closest('.trading-main')).not.toBeNull()

    expect(declared('.trading-workspace', 'display')).toBe('grid')
    expect(declared('.trading-workspace', 'grid-template-rows')).toBe('auto 1fr')
    expect(declared('.pipeline-zone', 'padding')).toBe('16px 16px 0')
    expect(declared('.constellation-panel', 'grid-column')).toBe('1')
    expect(declared('.constellation-panel', 'grid-row')).toBe('1')
    expect(declared('.agent-detail', 'grid-column')).toBe('2')
    expect(declared('.agent-detail', 'grid-row')).toBe('1')
    expect(declared('.panel', 'background')).toBe('#0d1117')
  })

  it('keeps delegation replay heading and long route text inside its panel', () => {
    render(<App />)

    const replay = screen.getByRole('region', { name: /위임 흐름 리플레이/i })
    expect(within(replay).getByText(/Delegation Graph Replay/i)).toBeInTheDocument()
    expect(within(replay).getByRole('heading', { level: 2, name: /위임 흐름 리플레이/i })).toBeInTheDocument()
    expect(within(replay).queryByText(/Agent Soul Map Pipeline/i)).not.toBeInTheDocument()

    expect(declared('.delegation-replay', 'max-height')).toBe('560px')
    expect(declared('.delegation-replay', 'overflow')).toBe('auto')
    expect(declared('.delegation-replay', 'contain')).toBe('layout paint')
    expect(declared('.delegation-replay .section-heading', 'display')).toBe('grid')
    expect(declared('.replay-status', 'flex-wrap')).toBe('wrap')
    expect(declared('.replay-edge', 'overflow-wrap')).toBe('anywhere')
    expect(declared('.replay-steps', 'display')).toBe('grid')
  })
})
