import React from 'react'
// SectionCard 组件属性
interface SectionCardProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  testId?: string
}
// 区块卡片组件
export function SectionCard({ title, description, actions, children, className = '', testId }: SectionCardProps) {
  return (
    <div
      data-testid={testId}
      className={`animate-fade-in rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm ${className}`}
    >
      {/* 卡片头部 */}
      {(title || actions) && (
        <div className="border-b border-[hsl(var(--border)_/_0.8)] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold tracking-tight text-[hsl(var(--foreground))]">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                  {description}
                </p>
              )}
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
      <div className="p-4 sm:p-6">
        {children}
      </div>
    </div>
  )
}
