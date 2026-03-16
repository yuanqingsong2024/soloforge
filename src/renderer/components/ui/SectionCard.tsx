import React from 'react'
// SectionCard 组件属性
interface SectionCardProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}
// 区块卡片组件
export function SectionCard({ title, description, actions, children, className = '' }: SectionCardProps) {
  return (
    <div className={`bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-workshop-md shadow-workshop-sm animate-fade-in ${className}`}>
      {/* 卡片头部 */}
      {(title || actions) && (
        <div className="px-4 sm:px-6 py-4 border-b border-[hsl(var(--border))]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-wrap">
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
