import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'
import { matchingRules, parseCssRules, resolveDeclaredValue } from './test/cssModel'

const rules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

/** 모바일/텔레그램 프리뷰 폭 */
const MOBILE = 390

describe('mobile layout contract', () => {
  useFakeElementBox({ constellation: { width: 654, height: 470 } })

  it('never places a panel in the second column once the workspace collapses to one column', () => {
    render(<App />)
    const main = document.querySelector<HTMLElement>('.trading-main')
    expect(main).not.toBeNull()

    expect(resolveDeclaredValue(main!, 'grid-template-columns', rules, { viewportWidth: MOBILE })).toBe('1fr')

    for (const panel of Array.from(main!.children)) {
      const column = resolveDeclaredValue(panel, 'grid-column', rules, { viewportWidth: MOBILE }) ?? 'auto'
      expect(
        /^\s*2\b/.test(column),
        `${panel.className} 이 1열 그리드에서 grid-column: ${column} 을 요구함 — 암묵적 2번째 열이 생겨 가로 스크롤이 발생한다. ` +
          `적용 규칙: ${matchingRules(panel, 'grid-column', rules, { viewportWidth: MOBILE }).map((r) => r.selector).join(' | ')}`,
      ).toBe(false)
    }
  })

  it('has no @media override that a higher-specificity top-level rule silently defeats', () => {
    render(<App />)

    const dead: string[] = []

    for (const rule of rules.filter((candidate) => candidate.media !== null)) {
      const max = rule.media!.match(/max-width:\s*(\d+)px/)
      if (!max) continue
      const viewportWidth = Number(max[1])

      let targets: Element[]
      try {
        targets = Array.from(document.querySelectorAll(rule.selector))
      } catch {
        continue
      }
      if (targets.length === 0) continue

      for (const [property, value] of Object.entries(rule.declarations)) {
        const winsSomewhere = targets.some(
          (target) => resolveDeclaredValue(target, property, rules, { viewportWidth }) === value,
        )
        if (!winsSomewhere) {
          const winner = matchingRules(targets[0], property, rules, { viewportWidth })[0]
          dead.push(
            `@media (max-width: ${viewportWidth}px) { ${rule.selector} { ${property}: ${value} } } ` +
              `— 실제로는 "${winner?.selector}"의 ${property}: ${winner?.declarations[property]} 가 이긴다`,
          )
        }
      }
    }

    expect(dead, `모바일 규칙인 척하지만 아무 효과도 없는 선언:\n${dead.join('\n')}`).toEqual([])
  })
})
