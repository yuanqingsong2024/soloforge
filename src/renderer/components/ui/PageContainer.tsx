import React from 'react'

// ============================================
// SoloForge Design System - Page Container
// 统一页面容器，提供一致的布局结构
// ============================================

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  maxWidth?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const maxWidthStyles = {
  none: '',
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export function PageContainer({
  children,
  className = '',
  maxWidth = 'full',
  padding = 'md',
}: PageContainerProps) {
  return (
    <div
      className={`
        mx-auto w-full
        ${maxWidthStyles[maxWidth]}
        ${paddingStyles[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ============================================
// Page Section - 页面分区
// ============================================

interface PageSectionProps {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  actions?: React.ReactNode
  noPadding?: boolean
}

export function PageSection({
  children,
  className = '',
  title,
  description,
  actions,
  noPadding = false,
}: PageSectionProps) {
  return (
    <div className={`rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] ${noPadding ? '' : 'p-6'} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// ============================================
// Page Grid - 页面网格布局
// ============================================

interface PageGridProps {
  children: React.ReactNode
  className?: string
  cols?: 1 | 2 | 3 | 4
  gap?: 'sm' | 'md' | 'lg'
}

const colsStyles = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

const gapStyles = {
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
}

export function PageGrid({
  children,
  className = '',
  cols = 3,
  gap = 'md',
}: PageGridProps) {
  return (
    <div className={`grid ${colsStyles[cols]} ${gapStyles[gap]} ${className}`}>
      {children}
    </div>
  )
}

// ============================================
// Page Divider - 页面分隔线
// ============================================

interface PageDividerProps {
  className?: string
  label?: string
}

export function PageDivider({ className = '', label }: PageDividerProps) {
  if (label) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
        <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
      </div>
    )
  }

  return <div className={`h-px w-full bg-[hsl(var(--border))] ${className}`} />
}

// ============================================
// Page Alert - 页面级提示
// ============================================

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface PageAlertProps {
  children: React.ReactNode
  variant?: AlertVariant
  title?: string
  className?: string
  onClose?: () => void
}

const alertStyles: Record<AlertVariant, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'bg-[hsl(var(--info))]/10',
    border: 'border-[hsl(var(--info))]/20',
    icon: 'text-[hsl(var(--info))]',
  },
  success: {
    bg: 'bg-[hsl(var(--success))]/10',
    border: 'border-[hsl(var(--success))]/20',
    icon: 'text-[hsl(var(--success))]',
  },
  warning: {
    bg: 'bg-[hsl(var(--warning))]/10',
    border: 'border-[hsl(var(--warning))]/20',
    icon: 'text-[hsl(var(--warning))]',
  },
  error: {
    bg: 'bg-[hsl(var(--destructive))]/10',
    border: 'border-[hsl(var(--destructive))]/20',
    icon: 'text-[hsl(var(--destructive))]',
  },
}

const alertIcons: Record<AlertVariant, React.ReactNode> = {
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  ),
  warning: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  ),
}

export function PageAlert({
  children,
  variant = 'info',
  title,
  className = '',
  onClose,
}: PageAlertProps) {
  const style = alertStyles[variant]

  return (
    <div
      className={`
        flex gap-3 rounded-xl border p-4
        ${style.bg}
        ${style.border}
        ${className}
      `}
    >
      <div className={style.icon}>{alertIcons[variant]}</div>
      <div className="flex-1">
        {title && (
          <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</h4>
        )}
        <div className={`text-sm text-[hsl(var(--foreground))] ${title ? 'mt-1' : ''}`}>
          {children}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ============================================
// Page Tabs - 页面标签页
// ============================================

interface TabItem {
  key: string
  label: string
  count?: number
  disabled?: boolean
}

interface PageTabsProps {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

export function PageTabs({ items, activeKey, onChange, className = '' }: PageTabsProps) {
  return (
    <div className={`border-b border-[hsl(var(--border))] ${className}`}>
      <nav className="flex gap-1 -mb-px">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.key)}
            className={`
              relative flex items-center gap-2 px-4 py-3 text-sm font-medium
              transition-colors duration-200
              ${item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              ${
                activeKey === item.key
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }
            `}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`
                  rounded-full px-2 py-0.5 text-xs font-semibold
                  ${
                    activeKey === item.key
                      ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                      : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  }
                `}
              >
                {item.count}
              </span>
            )}
            {activeKey === item.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))]" />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
