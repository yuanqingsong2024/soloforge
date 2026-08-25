import React from 'react'

// ============================================
// SoloForge Design System - Section Card V2
// 区块卡片组件
// ============================================

interface SectionCardProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  testId?: string
  variant?: 'default' | 'bordered' | 'flat'
  hover?: boolean
}

// 区块卡片组件
export function SectionCard({ 
  title, 
  description, 
  actions, 
  children, 
  className = '', 
  testId,
  variant = 'default',
  hover = false
}: SectionCardProps) {
  const variantStyles = {
    default: 'rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card))] shadow-[var(--shadow-card)]',
    bordered: 'rounded-2xl border border-[hsl(var(--border)/0.8)] bg-[hsl(var(--card))] shadow-none',
    flat: 'rounded-2xl bg-[hsl(var(--card)/0.8)] shadow-none border-none',
  }

  const hoverStyles = hover ? 'transition-all duration-200 hover:shadow-[var(--shadow-elevated)] hover:border-[hsl(var(--primary)/0.3)] hover:-translate-y-0.5' : ''

  return (
    <div
      data-testid={testId}
      className={`animate-fadeIn ${variantStyles[variant]} ${hoverStyles} ${className}`}
    >
      {/* 卡片头部 */}
      {(title || actions) && (
        <div className="border-b border-[hsl(var(--border)/0.4)] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {/* 左侧装饰点 */}
              {title && (
                <div className="h-2 w-2 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--google-green))]" />
              )}
              <div>
                {title && (
                  <h3 className="text-base font-semibold tracking-tight text-[hsl(var(--foreground))]">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      {/* 卡片内容 */}
      <div className="p-5 sm:p-6">
        {children}
      </div>
    </div>
  )
}
