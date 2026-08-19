import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'
import { matchingRules, parseCssRules, resolveDeclaredValue, stackingContextOf } from './test/cssModel'

const rules = parseCssRules(readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'))

describe('z-index declarations are not dead weight', () => {
  useFakeElementBox({ constellation: { width: 720, height: 470 } })

  it('only declares z-index where it can actually order something', () => {
    render(<App />)

    const layered = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((element) => {
      const zIndex = resolveDeclaredValue(element, 'z-index', rules)
      return Boolean(zIndex) && zIndex !== 'auto'
    })

    const lonely: string[] = []
    for (const element of layered) {
      const context = stackingContextOf(element, rules)
      const siblings = layered.filter(
        (other) => other !== element && stackingContextOf(other, rules) === context,
      )
      if (siblings.length === 0) {
        lonely.push(
          `${element.className || element.tagName} 의 z-index: ${resolveDeclaredValue(element, 'z-index', rules)} ` +
            `— 같은 스택 컨텍스트(${(context as HTMLElement | null)?.className ?? '루트'})에 겨룰 상대가 없다. ` +
            `적용 규칙: ${matchingRules(element, 'z-index', rules).map((r) => r.selector).join(' | ')}`,
        )
      }
    }

    expect(lonely, `아무 것도 정렬하지 못하는 z-index 선언:\n${lonely.join('\n')}`).toEqual([])
  })

  it('does not redeclare a value the element already gets from another rule', () => {
    render(<App />)
    const strip = document.querySelector('.pipeline-strip')
    expect(strip).not.toBeNull()

    const redundant: string[] = []
    for (const rule of matchingRules(strip!, 'background', rules)) {
      const others = matchingRules(strip!, 'background', rules).filter((other) => other !== rule)
      if (others.some((other) => other.declarations.background === rule.declarations.background)) {
        redundant.push(`${rule.selector} { background: ${rule.declarations.background} }`)
      }
    }

    expect(redundant, `같은 엘리먼트에 같은 값을 두 번 선언한다:\n${redundant.join('\n')}`).toEqual([])
  })
})
