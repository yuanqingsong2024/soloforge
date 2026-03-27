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
      <div className="flex flex-col gap-4 rounded-workshop-lg border border-[hsl(var(--border)_/_0.78)] bg-[hsl(var(--card)_/_0.72)] px-5 py-5 shadow-workshop-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {description}
            </p>
          )}
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
