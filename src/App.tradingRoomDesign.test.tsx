import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from './App'

describe('MACADAMIA trading room visual contract', () => {
  it('renders the dashboard as a dark trading terminal with fixed operations chrome', () => {
    render(<App />)

    const shell = screen.getByTestId('trading-room-shell')
    expect(shell).toHaveClass('trading-room-shell')

    const header = screen.getByRole('banner', { name: /MACADAMIA Trading Room/i })
    expect(within(header).getByText('MACA')).toBeInTheDocument()
    expect(within(header).getByText('DAMIA')).toBeInTheDocument()
    expect(within(header).getByText(/FINANCIAL ANALYSIS PIPELINE/i)).toBeInTheDocument()
    expect(within(header).getAllByText(/LIVE/i).length).toBeGreaterThan(0)
    expect(within(header).getByText(/COMPLETE/i)).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: /실행 기록/i })
    expect(within(sidebar).getByText(/현재 실행/i)).toBeInTheDocument()
    expect(within(sidebar).getAllByText(/ARCHIVE/i).length).toBeGreaterThan(0)

    expect(screen.getByRole('region', { name: /MACADAMIA Pipeline Layers/i })).toBeInTheDocument()
    expect(screen.getByText(/LAYER 0/i)).toBeInTheDocument()
    expect(screen.getByText(/데이터 수집/i)).toBeInTheDocument()
    expect(screen.getAllByText(/⇉ 병렬/i).length).toBeGreaterThan(0)
  })
})
