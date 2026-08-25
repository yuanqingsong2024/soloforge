import React from 'react'

// ============================================
// SoloForge Design System - Empty State V2
// 空状态展示组件
// ============================================

type EmptyStateVariant = 'default' | 'search' | 'error' | 'success' | 'loading'

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  variant?: EmptyStateVariant
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
  // 兼容旧接口
  message?: string
  tone?: 'default' | 'danger'
}

// 预设图标 - 带渐变效果
const presetIcons: Record<EmptyStateVariant, React.ReactNode> = {
  default: (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--muted-foreground))]">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
      <path d="M12 10v6"/>
      <path d="m9 13 3-3 3 3"/>
    </svg>
  ),
  search: (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--google-blue))]">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
      <path d="M8 11h6"/>
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--destructive))]">
      <circle cx="12" cy="12" r="10"/>
      <path d="m15 9-6 6"/>
      <path d="m9 9 6 6"/>
    </svg>
  ),
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--success))]">
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  loading: (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[hsl(var(--primary))] animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
}

const variantGradients: Record<EmptyStateVariant, string> = {
  default: 'from-[hsl(var(--muted-foreground)/0.1)] to-transparent',
  search: 'from-[hsl(var(--google-blue)/0.1)] to-transparent',
  error: 'from-[hsl(var(--destructive)/0.1)] to-transparent',
  success: 'from-[hsl(var(--success)/0.1)] to-transparent',
  loading: 'from-[hsl(var(--primary)/0.1)] to-transparent',
}

// 新版 EmptyState - 完整功能
export function EmptyState({
  icon,
  title,
  description,
  variant = 'default',
  action,
  secondaryAction,
  className = '',
  // 兼容旧接口
  message,
  tone,
}: EmptyStateProps) {
  // 如果传入 message（旧接口），使用简化样式
  if (message !== undefined) {
    return (
      <div 
        className={`
          rounded-2xl border border-[hsl(var(--border)/0.6)] bg-gradient-to-br ${tone === 'danger' ? 'from-[hsl(var(--destructive)/0.05)]' : 'from-[hsl(var(--muted)/0.5)]'} to-transparent px-6 py-10 
          text-center text-sm shadow-[var(--shadow-sm)]
          ${tone === 'danger' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'} 
          ${className}
        `}
      >
        {message}
      </div>
    )
  }

  // 新接口
  const displayIcon = icon || presetIcons[variant]
  const gradientClass = variantGradients[variant]

  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      {/* 图标容器 - 带渐变背景 */}
      <div className={`relative mb-6 rounded-2xl bg-gradient-to-br ${gradientClass} p-6 shadow-[var(--shadow-sm)]`}>
        <div className="relative">
          {displayIcon}
        </div>
        {/* 装饰性光晕 */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent" />
      </div>
      
      {title && (
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          {title}
        </h3>
      )}
      
      {description && (
        <p className="mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="mt-6 flex items-center gap-3">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.9)] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[hsl(var(--primary)/0.25)] transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.3)] active:translate-y-0"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center justify-center rounded-xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--background))]/50 px-5 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:bg-[hsl(var(--accent))] active:translate-y-0"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// Inline Empty State - 内联空状态
// ============================================

interface InlineEmptyStateProps {
  message?: string
  className?: string
}

export function InlineEmptyState({
  message = '暂无数据',
  className = '',
}: InlineEmptyStateProps) {
  return (
    <div className={`flex items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] py-8 text-sm text-[hsl(var(--muted-foreground))] ${className}`}>
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12h8"/>
        </svg>
        {message}
      </div>
    </div>
  )
}
