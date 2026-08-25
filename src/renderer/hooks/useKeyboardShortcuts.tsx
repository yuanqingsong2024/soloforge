import { useEffect, useCallback, useState, useRef } from 'react'

// ============================================
// 快捷键配置类型
// ============================================

export interface KeyboardShortcut {
  /** 快捷键描述（如 "⌘K"） */
  keys: string[]
  /** 描述文本 */
  description: string
  /** 分类 */
  category: 'navigation' | 'global' | 'search' | 'actions'
  /** 是否需要修饰键 */
  hasModifier?: boolean
}

interface UseKeyboardShortcutsOptions {
  /** 是否启用快捷键 */
  enabled?: boolean
  /** 自定义快捷键回调 */
  onShortcut?: (shortcut: string) => void
}

// ============================================
// 全局快捷键定义
// ============================================

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // 全局操作
  {
    keys: ['?'],
    description: '显示快捷键帮助',
    category: 'global',
    hasModifier: false,
  },
  {
    keys: ['Escape'],
    description: '关闭弹窗/取消操作',
    category: 'global',
    hasModifier: false,
  },
  {
    keys: ['⌘K', 'Ctrl+K'],
    description: '聚焦搜索框',
    category: 'search',
    hasModifier: true,
  },

  // 导航（gh-vi 风格序列快捷键）
  {
    keys: ['G D'],
    description: '前往仪表盘',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G T'],
    description: '前往工单看板',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G A'],
    description: '前往审批中心',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G S'],
    description: '前往团队管理',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G E'],
    description: '前往审计日志',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G O'],
    description: '前往配置中心',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G H'],
    description: '前往宿主机 Agent',
    category: 'navigation',
    hasModifier: false,
  },
  {
    keys: ['G P'],
    description: '前往部署管理',
    category: 'navigation',
    hasModifier: false,
  },

  // 快速操作
  {
    keys: ['N'],
    description: '新建工单',
    category: 'actions',
    hasModifier: false,
  },
  {
    keys: ['R'],
    description: '刷新当前页面',
    category: 'actions',
    hasModifier: false,
  },
  {
    keys: ['⌘S', 'Ctrl+S'],
    description: '保存当前编辑',
    category: 'actions',
    hasModifier: true,
  },
  {
    keys: ['/'],
    description: '聚焦搜索框',
    category: 'search',
    hasModifier: false,
  },
]

// 序列快捷键超时（毫秒）
const SEQUENCE_TIMEOUT = 500

// ============================================
// Hook 实现
// ============================================

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { enabled = true, onShortcut } = options
  const [showHelp, setShowHelp] = useState(false)

  // 使用 ref 存储序列键，避免闭包问题和依赖循环
  const sequenceKeysRef = useRef<string[]>([])
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 导航映射
  const navigationMap: Record<string, string> = {
    gd: '/',
    gt: '/tickets',
    ga: '/approvals',
    gs: '/team',
    ge: '/audit',
    go: '/openclaw-config',
    gh: '/host-agents',
    gp: '/deployments',
  }

  const clearSequence = useCallback(() => {
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current)
      sequenceTimerRef.current = null
    }
    sequenceKeysRef.current = []
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // 如果在输入框中（textarea、input、 contenteditable），不触发导航快捷键
      const target = event.target as HTMLElement
      const isInInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // 只有特定快捷键可以在输入框中触发
      const allowedInInput = ['Escape', '⌘K', 'Ctrl+K', '?']

      // 序列快捷键的处理
      if (!isInInput || allowedInInput.includes(event.key)) {
        // 检查 Escape
        if (event.key === 'Escape') {
          setShowHelp(false)
          clearSequence()
          return
        }

        // 检查显示帮助
        if (event.key === '?' && !isInInput) {
          event.preventDefault()
          setShowHelp(prev => !prev)
          onShortcut?.('?')
          return
        }

        // 检查搜索快捷键
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
          event.preventDefault()
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="搜索"]')
          searchInput?.focus()
          onShortcut?.('⌘K')
          return
        }

        // 检查 "/" 聚焦搜索
        if (event.key === '/' && !isInInput) {
          event.preventDefault()
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="搜索"]')
          searchInput?.focus()
          onShortcut?.('/')
          return
        }
      }

      // 以下快捷键只在非输入框中触发
      if (isInInput) return

      // 序列快捷键处理（G 开头）
      const key = event.key.toLowerCase()
      const currentKeys = sequenceKeysRef.current

      if (key === 'g' && currentKeys.length === 0) {
        // 开始序列
        sequenceKeysRef.current = ['g']
        sequenceTimerRef.current = setTimeout(clearSequence, SEQUENCE_TIMEOUT)
        return
      }

      if (currentKeys.length === 1 && currentKeys[0] === 'g') {
        // 等待第二个键
        clearSequence()
        const navKey = `g${key}`
        const path = navigationMap[navKey]
        if (path) {
          event.preventDefault()
          window.location.hash = `#${path}`
          onShortcut?.(navKey)
        }
        return
      }

      // 刷新快捷键
      if (key === 'r' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        window.location.reload()
        onShortcut?.('R')
        return
      }

      // 保存快捷键
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        // 触发保存事件
        window.dispatchEvent(new CustomEvent('keyboard-save'))
        onShortcut?.('⌘S')
        return
      }
    },
    [enabled, clearSequence, onShortcut]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearSequence()
    }
  }, [enabled, handleKeyDown, clearSequence])

  return {
    showHelp,
    setShowHelp,
    shortcuts: KEYBOARD_SHORTCUTS,
  }
}

// ============================================
// 快捷键帮助弹窗组件
// ============================================

import React from 'react'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
  shortcuts?: KeyboardShortcut[]
}

export function KeyboardShortcutsHelp({
  isOpen,
  onClose,
  shortcuts = KEYBOARD_SHORTCUTS,
}: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null

  const categories = [
    { key: 'navigation', label: '导航' },
    { key: 'search', label: '搜索' },
    { key: 'global', label: '全局' },
    { key: 'actions', label: '操作' },
  ] as const

  const groupedShortcuts = categories.reduce(
    (acc, cat) => {
      acc[cat.key] = shortcuts.filter(s => s.category === cat.key)
      return acc
    },
    {} as Record<string, KeyboardShortcut[]>
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 弹窗 */}
      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--popover))]/98 shadow-[var(--shadow-elevated)] backdrop-blur-xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              键盘快捷键
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              按 <kbd className="inline-flex items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-1.5 py-0.5 text-[10px] font-mono">?</kbd> 打开此帮助
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* 快捷键列表 */}
        <div className="space-y-6">
          {categories.map(cat => {
            const items = groupedShortcuts[cat.key]
            if (!items || items.length === 0) return null

            return (
              <div key={cat.key}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] mb-3">
                  {cat.label}
                </h3>
                <div className="space-y-2">
                  {items.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[hsl(var(--accent))]/50 transition-colors"
                    >
                      <span className="text-sm text-[hsl(var(--foreground))]">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            {keyIndex > 0 && (
                              <span className="text-[hsl(var(--muted-foreground))] mx-0.5">/</span>
                            )}
                            <kbd className="inline-flex items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-2 py-1 text-xs font-mono text-[hsl(var(--foreground))]">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部提示 */}
        <div className="mt-6 pt-4 border-t border-[hsl(var(--border)/0.4)]">
          <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
            序列快捷键（如 G D）需快速连续按两个键
          </p>
        </div>
      </div>
    </div>
  )
}
