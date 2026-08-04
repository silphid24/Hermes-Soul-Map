import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('Request Protocol Execution Layer — visible contract', () => {
  it('Request Lab renders dry-run execution preview for queued requests', () => {
    render(<App />)
    const panel = screen.getByRole('region', { name: 'Request Protocol Execution Layer' })
    expect(within(panel).getByText(/Execution Preview/i)).toBeInTheDocument()
    expect(within(panel).getAllByText(/dry-run/i).length).toBeGreaterThan(0)
    expect(within(panel).getByText(/external mutation performed: false/i)).toBeInTheDocument()
  })

  it('approval-gated n8n/GitHub style request shows approval marker before simulation', async () => {
    render(<App />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('To'), 'n8n-mcp')
    await user.type(screen.getByPlaceholderText(/capability/), 'workflow.mutate')
    await user.type(screen.getByPlaceholderText('요청 요약'), 'n8n workflow mutation 승인 필요')
    await user.click(screen.getByRole('button', { name: '요청 생성' }))

    const panel = screen.getByRole('region', { name: 'Request Protocol Execution Layer' })
    expect(within(panel).getAllByText(/approval required/i).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(/n8n workflow/i).length).toBeGreaterThan(0)
  })

  it('simulated execution records audit log without external mutation', async () => {
    render(<App />)
    const user = userEvent.setup()
    const panel = screen.getByRole('region', { name: 'Request Protocol Execution Layer' })
    await user.click(within(panel).getAllByRole('button', { name: /simulate/i })[0])

    expect(within(panel).getByText(/Audit Log/i)).toBeInTheDocument()
    expect(within(panel).getAllByText(/simulated/i).length).toBeGreaterThan(0)
    expect(within(panel).getAllByText(/external mutation performed: false/i).length).toBeGreaterThan(0)
  })
})
