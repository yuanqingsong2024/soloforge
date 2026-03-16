import React from 'react'
// PageHeader 组件属性
interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}
// 页面标题组件
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 animate-slide-in-down">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
