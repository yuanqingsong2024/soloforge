import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge, StatusDot } from '../../src/renderer/components/ui/StatusBadge'

describe('StatusBadge', () => {
  it('renders the supplied label and size classes', () => {
    render(<StatusBadge label="在线" tone="success" size="lg" />)

    const badge = screen.getByText('在线')
    expect(badge).toHaveClass('text-sm')
    expect(badge).toHaveClass('text-[hsl(var(--success))]')
  })

  it('renders a pulse indicator only when requested', () => {
    const { rerender } = render(<StatusBadge label="运行中" pulse />)
    expect(screen.getByText('运行中').querySelector('span')).toHaveClass('animate-pulse-status')

    rerender(<StatusBadge label="已停止" />)
    expect(screen.getByText('已停止').querySelector('span')).toBeNull()
  })
})

describe('StatusDot', () => {
  it('uses the online color and pulses online states by default', () => {
    render(<StatusDot status="online" />)

    const dot = screen.getByTitle('online')
    expect(dot).toHaveClass('bg-[hsl(var(--success))]')
    expect(dot).toHaveClass('animate-pulse-status')
  })

  it('allows callers to disable pulsing', () => {
    render(<StatusDot status="running" pulse={false} size="lg" />)

    const dot = screen.getByTitle('running')
    expect(dot).toHaveClass('h-2.5')
    expect(dot).not.toHaveClass('animate-pulse-status')
  })
})
