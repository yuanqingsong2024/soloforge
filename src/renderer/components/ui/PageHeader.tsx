import React from 'react'

// ============================================
// SoloForge Design System - Page Header V2
// 页面标题组件
// ============================================

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  variant?: 'default' | 'gradient' | 'minimal'
}

// 页面标题组件
export function PageHeader({ title, description, actions, variant = 'default' }: PageHeaderProps) {
  const variantStyles = {
    default: 'rounded-2xl border border-[hsl(var(--border)/0.6)] bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card)/0.9)] shadow-[var(--shadow-soft)]',
    gradient: 'rounded-2xl border border-[hsl(var(--primary)/0.15)] bg-gradient-to-br from-[hsl(var(--primary)/0.05)] via-[hsl(var(--card))] to-[hsl(var(--google-green)/0.03)] shadow-[var(--shadow-soft)]',
    minimal: 'bg-transparent shadow-none border-none',
  }

  return (
    <div className="mb-6 animate-fadeInUp">
      <div className={`flex flex-col gap-4 px-5 py-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 ${variantStyles[variant]}`}>
        {/* 左侧装饰线 */}
        <div className="flex items-center gap-4">
          <div className="hidden h-10 w-1 rounded-full bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--google-green))] sm:block" />
          <div className="min-w-0">
            <h1 className="text-[1.75rem] font-bold tracking-tight bg-gradient-to-r from-[hsl(var(--foreground))] to-[hsl(var(--foreground)/0.8)] bg-clip-text text-transparent">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {description}
              </p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex flex-wrap items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
