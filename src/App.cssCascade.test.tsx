import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'
import { parseCssRules, resolveDeclaredValue, specificity } from './test/cssModel'

const rules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

describe('css cascade resolver', () => {
  it('ranks selectors by id/class/type counts', () => {
    expect(specificity('.edges path')).toEqual([0, 1, 1])
    expect(specificity('.edge-arrowhead')).toEqual([0, 1, 0])
    expect(specificity('.trading-main .constellation')).toEqual([0, 2, 0])
    expect(specificity('#app .panel > div')).toEqual([1, 1, 1])
  })

  it('keeps true source order between top-level and @media rules', () => {
    const sample = parseCssRules(
      '@media (max-width: 980px) { .a { color: red; } } .a { color: blue; }',
    )
    const element = document.createElement('div')
    element.className = 'a'
    // 같은 특이도라면 파일에서 나중에 나온 최상위 규칙이 이긴다 — @media라고 자동으로 이기지 않는다.
    expect(resolveDeclaredValue(element, 'color', sample, { viewportWidth: 390 })).toBe('blue')
  })

  it('picks the winning declaration by specificity, then source order', () => {
    const sample = parseCssRules('.a { color: red; } .b.c { color: green; } .a { color: blue; }')
    const element = document.createElement('div')
    element.className = 'a b c'
    expect(resolveDeclaredValue(element, 'color', sample)).toBe('green')

    const tie = parseCssRules('.a { color: red; } .a { color: blue; }')
    expect(resolveDeclaredValue(element, 'color', tie)).toBe('blue')
  })
})

describe('connection arrowhead is actually painted', () => {
  useFakeElementBox({ constellation: { width: 654, height: 470 } })

  it('resolves the arrowhead marker to a solid fill, not the edge stroke rule', () => {
    render(<App />)
    const constellation = screen.getByRole('region', { name: /Agent Constellation/i })
    const arrowhead = constellation.querySelector('marker .edge-arrowhead')
    expect(arrowhead, 'marker 안에 화살촉 엘리먼트가 있어야 한다').not.toBeNull()

    expect(resolveDeclaredValue(arrowhead!, 'fill', rules)).not.toBe('none')
    expect(resolveDeclaredValue(arrowhead!, 'stroke', rules)).toBe('none')
  })

})

describe('constellation styling has a single source of truth', () => {
  useFakeElementBox({ constellation: { width: 720, height: 470 } })

  // 크기·배경 선언이 파일 두 곳에 흩어져 있으면, 앞쪽을 고쳐도 아무 일이 없어 읽는 사람을 속인다.
  it.each(['.constellation', '.constellation-panel'])('has no dead declaration on %s', (selector) => {
    render(<App />)
    const element = document.querySelector(selector)
    expect(element, `${selector} 가 렌더되지 않음`).not.toBeNull()

    const dead: string[] = []
    for (const rule of rules.filter((candidate) => candidate.media === null && candidate.selector === selector)) {
      for (const [property, value] of Object.entries(rule.declarations)) {
        const winner = resolveDeclaredValue(element!, property, rules)
        if (winner !== value) {
          dead.push(`${selector} { ${property}: ${value} } — 실제로 적용되는 값은 ${winner}`)
        }
      }
    }

    expect(dead, `${selector} 에 아무 효과 없는 선언이 남아 있다:\n${dead.join('\n')}`).toEqual([])
  })
})
