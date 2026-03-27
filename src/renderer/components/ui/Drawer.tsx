import React, { useRef, useEffect } from 'react'
import { useDrawerManager } from '../../hooks/useDrawerManager'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  activeId?: string | null
  /** 可选的副标题，用于显示 ID 或其他元数据 */
  subtitle?: string
}

/**
 * Drawer 侧边栏组件
 * 
 * 设计风格：Workshop OS（工业极简、控制台感）
 * 
 * 功能：
 * - 从右侧滑入/滑出
 * - ESC 键关闭
 * - 点击遮罩关闭
 * - 平滑动画（300ms）
 * - 关闭动画期间保留内容（防止突然消失）
 * - 自动焦点管理
 * - 滚动锁定（防止底层页面滚动）
 */
export const Drawer: React.FC<DrawerProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  activeId,
  subtitle 
}) => {
  // 管理生命周期与副作用
  const { snapshotId } = useDrawerManager({ isOpen, onClose, activeId })
  const drawerRef = useRef<HTMLDivElement>(null)

  // 焦点陷阱管理：打开时自动聚焦到侧边栏内部
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus()
    }
  }, [isOpen])

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? 'visible' : 'invisible delay-300'}`}
      aria-labelledby="drawer-title"
      role="dialog"
      aria-modal="true"
      data-testid="drawer-container"
    >
      {/* 背景遮罩：柔和模糊层 */}
      <div
        className={`absolute inset-0 bg-[hsl(var(--foreground)_/_0.16)] backdrop-blur-sm transition-opacity duration-300 ease-out
          ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
        data-testid="drawer-backdrop"
      />

      {/* 侧边栏面板：Material 3 风格面板 */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--card)_/_0.96)]
          shadow-workshop-lg outline-none backdrop-blur
          transition-transform duration-300 ease-out will-change-transform
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        data-testid="drawer-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.58)] px-6 py-4 backdrop-blur">
          <div className="flex-1 min-w-0">
            <h2 
              id="drawer-title" 
              className="truncate text-base font-semibold tracking-tight text-[hsl(var(--foreground))]"
              data-testid="drawer-title"
            >
              {title}
            </h2>
            {subtitle && (
              <div className="mt-1 text-xs font-mono text-[hsl(var(--muted-foreground))]" data-testid="drawer-subtitle">
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[hsl(var(--muted-foreground))] shadow-workshop-sm transition-colors duration-200 hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]
              focus:ring-2 focus:ring-[hsl(var(--ring))] focus:outline-none"
            aria-label="Close drawer"
            data-testid="drawer-close-button"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - 可滚动区域 */}
        <div 
          className="flex-1 space-y-4 overflow-y-auto bg-[hsl(var(--card))] p-6"
          data-testid="drawer-content"
        >
          {/* 只有在至少打开过一次时才渲染子组件，且在关闭动画期间保留渲染 */}
          {(isOpen || snapshotId) ? children : null}
        </div>
      </div>
    </div>
  )
}
