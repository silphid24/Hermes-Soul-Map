import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { RUNBOOK_SECTIONS } from './domain/runbook'

function runbookPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Agent Runbook Operating Manual' })
}

async function selectAgent(name: string | RegExp): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name }))
}

describe('Agent Runbook 패널 — visible contract', () => {
  it('7개 섹션 제목을 모두 렌더한다', () => {
    render(<App />)
    const panel = runbookPanel()
    for (const section of RUNBOOK_SECTIONS) {
      expect(within(panel).getByText(section.label)).toBeInTheDocument()
    }
  })

  it('선택된 에이전트 이름과 posture를 보여준다', () => {
    render(<App />)
    const panel = runbookPanel()
    expect(within(panel).getAllByText(/Hermes Default/).length).toBeGreaterThan(0)
    expect(within(panel).getByTestId('runbook-posture')).toBeInTheDocument()
  })

  it('Google Workspace를 선택하면 메일 발송 승인 게이트를 보여준다', async () => {
    render(<App />)
    await selectAgent(/Google Workspace API/)
    expect(within(runbookPanel()).getByText(/메일 발송/)).toBeInTheDocument()
  })

  it('Claude Code를 선택하면 GitHub push·destructive local ops 게이트를 보여준다', async () => {
    render(<App />)
    await selectAgent(/Claude Code Dev Cell/)
    const panel = runbookPanel()
    expect(within(panel).getByText(/GitHub push/)).toBeInTheDocument()
    expect(within(panel).getByText(/destructive local ops/)).toBeInTheDocument()
  })

  it('에이전트를 바꾸면 runbook 내용이 실제로 달라진다', async () => {
    render(<App />)
    await selectAgent(/Google Workspace API/)
    const workspaceText = runbookPanel().textContent ?? ''
    await selectAgent(/AI Trend Radar/)
    const radarText = runbookPanel().textContent ?? ''

    expect(radarText).not.toBe(workspaceText)
    expect(workspaceText).toMatch(/메일 발송/)
    expect(radarText).not.toMatch(/메일 발송/)
  })

  it('모든 항목에 파생 근거(evidence)를 함께 보여준다', async () => {
    render(<App />)
    await selectAgent(/Claude Code Dev Cell/)
    const panel = runbookPanel()
    const items = within(panel).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.querySelector('.runbook-evidence')?.textContent?.trim()).toBeTruthy()
    }
  })
})
