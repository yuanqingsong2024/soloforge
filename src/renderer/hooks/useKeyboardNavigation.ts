// ============================================
// Keyboard Navigation Hook
// 键盘导航 Hook
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 键盘导航配置
 */
interface UseKeyboardNavigationOptions {
  /** 启用键盘导航 */
  enabled?: boolean
  /** 焦点环样式 */
  focusRingClass?: string
  /** 焦点管理器配置 */
  roving?: {
    /** 是否启用 */
    enabled?: boolean
    /** 选择器 */
    selector?: string
    /** 初始焦点索引 */
    initialIndex?: number
  }
}

/**
 * 键盘导航返回值
 */
interface UseKeyboardNavigationReturn {
  /** 焦点索引 */
  focusedIndex: number
  /** 设置焦点索引 */
  setFocusedIndex: (index: number) => void
  /** 处理键盘事件 */
  handleKeyDown: (event: React.KeyboardEvent) => void
  /** 获取焦点样式 */
  getFocusProps: (index: number) => { tabIndex: number; 'aria-selected'?: boolean }
  /** 容器 ref */
  containerRef: React.RefObject<HTMLDivElement>
}

/**
 * 键盘导航 Hook
 */
export function useKeyboardNavigation(
  itemCount: number,
  options: UseKeyboardNavigationOptions = {}
): UseKeyboardNavigationReturn {
  const {
    enabled = true,
    roving = { enabled: true, selector: '[role="option"], [role="menuitem"], button, a, [tabindex]' },
  } = options

  const [focusedIndex, setFocusedIndex] = useState(roving?.initialIndex ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled) return

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault()
          setFocusedIndex(prev => (prev + 1) % itemCount)
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault()
          setFocusedIndex(prev => (prev - 1 + itemCount) % itemCount)
          break
        case 'Home':
          event.preventDefault()
          setFocusedIndex(0)
          break
        case 'End':
          event.preventDefault()
          setFocusedIndex(itemCount - 1)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          // 触发选中
          break
      }
    },
    [enabled, itemCount]
  )

  const getFocusProps = useCallback(
    (index: number) => ({
      tabIndex: index === focusedIndex ? 0 : -1,
      'aria-selected': index === focusedIndex,
    }),
    [focusedIndex]
  )

  // 自动聚焦到当前索引的元素
  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    const selector = roving?.selector || '[tabindex="0"]'
    const elements = container.querySelectorAll<HTMLElement>(selector)
    const target = elements[focusedIndex]

    if (target) {
      target.focus()
    }
  }, [focusedIndex, enabled, roving?.selector])

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
    getFocusProps,
    containerRef,
  }
}

/**
 * 焦点管理 Hook
 */
export function useFocusManager() {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLElement>(null)

  const focus = useCallback(() => {
    ref.current?.focus()
  }, [])

  const blur = useCallback(() => {
    ref.current?.blur()
  }, [])

  return { ref, focused, setFocused, focus, blur }
}

/**
 * Trap Focus - 将焦点限制在区域内
 */
export function useTrapFocus(enabled: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const focusableSelectors = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusable = container.querySelectorAll<HTMLElement>(focusableSelectors)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [enabled])

  return containerRef
}
