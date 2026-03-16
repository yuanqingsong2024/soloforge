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
      {/* 背景遮罩：深色玻璃感 */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out
          ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
        data-testid="drawer-backdrop"
      />

      {/* 侧边栏面板：工业风、控制台感 */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full max-w-2xl bg-[hsl(var(--background))] border-l border-[hsl(var(--border))]
          shadow-[0_0_40px_rgba(0,0,0,0.8)] outline-none flex flex-col
          transition-transform duration-300 ease-out will-change-transform
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        data-testid="drawer-panel"
      >
        {/* Header - 控制台风格头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          <div className="flex-1 min-w-0">
            <h2 
              id="drawer-title" 
              className="text-sm font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider truncate"
              data-testid="drawer-title"
            >
              {title}
            </h2>
            {subtitle && (
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-mono" data-testid="drawer-subtitle">
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors 
              focus:ring-2 focus:ring-[hsl(var(--ring))] focus:outline-none p-1 rounded-workshop-sm"
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
          className="flex-1 overflow-y-auto p-6 space-y-4"
          data-testid="drawer-content"
        >
          {/* 只有在至少打开过一次时才渲染子组件，且在关闭动画期间保留渲染 */}
          {(isOpen || snapshotId) ? children : null}
        </div>
      </div>
    </div>
  )
}
