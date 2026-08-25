import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useKeyboardNavigation } from '../../src/renderer/hooks/useKeyboardNavigation'

describe('useKeyboardNavigation', () => {
  it('moves the roving index with arrow, Home, and End keys', () => {
    const { result } = renderHook(() => useKeyboardNavigation(3))

    expect(result.current.focusedIndex).toBe(0)
    expect(result.current.getFocusProps(0)).toEqual({ tabIndex: 0, 'aria-selected': true })
    expect(result.current.getFocusProps(1)).toEqual({ tabIndex: -1, 'aria-selected': false })

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: () => undefined,
      } as React.KeyboardEvent)
    })
    expect(result.current.focusedIndex).toBe(1)

    act(() => {
      result.current.handleKeyDown({
        key: 'End',
        preventDefault: () => undefined,
      } as React.KeyboardEvent)
    })
    expect(result.current.focusedIndex).toBe(2)

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowRight',
        preventDefault: () => undefined,
      } as React.KeyboardEvent)
    })
    expect(result.current.focusedIndex).toBe(0)
  })

  it('does not change the index when disabled', () => {
    const { result } = renderHook(() => useKeyboardNavigation(2, { enabled: false }))

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: () => undefined,
      } as React.KeyboardEvent)
    })

    expect(result.current.focusedIndex).toBe(0)
  })

  it('supports a custom initial index', () => {
    const { result } = renderHook(() => useKeyboardNavigation(4, {
      roving: { initialIndex: 2 },
    }))

    expect(result.current.focusedIndex).toBe(2)
  })
})
