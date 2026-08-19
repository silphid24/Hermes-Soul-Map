import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from './App'
import { useFakeElementBox } from './test/layoutBox'

describe('agent detail headings', () => {
  useFakeElementBox({ constellation: { width: 720, height: 470 } })

  it.each([
    'Soul Diff / Identity Drift',
    'Agent Activity Blackbox',
    'Agent Runbook / Operating Manual',
  ])('names the "%s" section exactly once', (title) => {
    render(<App />)
    const detail = screen.getByRole('region', { name: /Selected Agent Detail/i })

    // 접힘 제목과 카드 헤더가 같은 문자열을 두 번 내면 화면에도 중복이고
    // 테스트도 getAllByText(...)[0] 같은 우회를 쓰게 된다.
    expect(
      within(detail).getAllByText(title),
      `"${title}" 이 detail 패널에 중복으로 렌더된다`,
    ).toHaveLength(1)
  })

  it('labels the delegation replay region with its heading, not a bilingual concatenation', () => {
    render(<App />)

    const replay = screen.getByRole('region', { name: '위임 흐름 리플레이' })
    expect(within(replay).getByRole('heading', { level: 2 })).toHaveTextContent('위임 흐름 리플레이')
    expect(
      replay.getAttribute('aria-label'),
      '접근성 이름은 이미 있는 제목을 aria-labelledby 로 가리켜야 한다 — 문자열을 따로 지어내면 화면과 어긋난다',
    ).toBeNull()
  })
})
