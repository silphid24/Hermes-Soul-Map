import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'
import { parseCssRules, resolveDeclaredValue } from './test/cssModel'

const rules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

/**
 * 막대 높이 퍼센트가 기준으로 삼는 컨테이닝 블록 높이를 구한다.
 * CSS에 명시적 px 높이를 가진 가장 가까운 조상까지 올라간다.
 */
function basisHeight(bar: HTMLElement): number {
  for (let node = bar.parentElement; node; node = node.parentElement) {
    const declared = resolveDeclaredValue(node, 'height', rules)
    // height: 100% 같은 상대값은 기준이 될 수 없다 — 위로 계속 올라간다.
    if (!declared || !declared.trim().endsWith('px')) continue
    const padding = resolveDeclaredValue(node, 'padding', rules)
    const inset = padding && padding.trim().endsWith('px') ? parseFloat(padding) : 0
    return parseFloat(declared) - inset * 2
  }
  return NaN
}

/** max-height 선언을 px 값으로 환산한다 (% 는 기준 높이에 대한 비율). */
function capFor(bar: HTMLElement, basis: number): number {
  const declared = resolveDeclaredValue(bar, 'max-height', rules)
  if (!declared) return Infinity
  if (declared.trim().endsWith('%')) return (parseFloat(declared) / 100) * basis
  const value = parseFloat(declared)
  return Number.isNaN(value) ? Infinity : value
}

describe('evolution rail encodes autonomy in bar height', () => {
  useFakeElementBox({ constellation: { width: 654, height: 470 } })

  it('never clamps two different autonomy values to the same rendered height, for any agent', () => {
    render(<App />)

    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.agent-node'))
    expect(nodes.length).toBeGreaterThan(1)

    const collisions: string[] = []

    for (const node of nodes) {
      fireEvent.click(node)

      const rail = document.querySelector<HTMLElement>('.evolution-rail')
      if (!rail) continue

      const bars = Array.from(rail.querySelectorAll<HTMLElement>('i'))
      if (bars.length < 2) continue

      // 막대가 자랄 수 있는 실제 세로 공간과 상한을 CSS에서 그대로 읽어온다.
      const track = basisHeight(bars[0])
      expect(track, '막대 높이 %가 기준으로 삼을 명시적 높이를 찾지 못함').toBeGreaterThan(0)
      const cap = capFor(bars[0], track)

      const rendered = bars.map((bar) => {
        const percent = parseFloat(bar.style.height)
        return { percent, height: Math.min((percent / 100) * track, cap) }
      })

      for (let i = 0; i < rendered.length; i++) {
        for (let j = i + 1; j < rendered.length; j++) {
          if (rendered[i].percent === rendered[j].percent) continue
          if (Math.abs(rendered[i].height - rendered[j].height) < 0.01) {
            collisions.push(
              `${node.textContent?.slice(0, 24)}: autonomy ${rendered[i].percent}% 와 ${rendered[j].percent}% 가 ` +
                `둘 다 ${rendered[i].height}px (기준 ${track}px, 상한 ${cap}px)`,
            )
          }
        }
      }
    }

    expect(collisions, `서로 다른 autonomy 값이 같은 높이로 뭉개짐:\n${collisions.join('\n')}`).toEqual([])
  })
})
