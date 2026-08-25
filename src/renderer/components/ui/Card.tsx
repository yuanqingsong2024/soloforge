import React from 'react'

// ============================================
// SoloForge Design System - Card 组件
// ============================================

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline' | 'ghost'
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-card border border-border shadow-sm',
  elevated: 'bg-card border border-border shadow-md',
  outline: 'bg-transparent border border-border',
  ghost: 'bg-transparent border border-transparent',
}

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  className = '',
  variant = 'default',
  hover = false,
  padding = 'md',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`
        rounded-xl
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${hover ? 'transition-all duration-200 hover:shadow-md hover:border-[hsl(var(--primary))]/20 hover:-translate-y-0.5 cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

// ============================================
// Card Header
// ============================================

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className = '', children, ...props }: CardHeaderProps) {
  return (
    <div className={`flex flex-col space-y-1.5 ${className}`} {...props}>
      {children}
    </div>
  )
}

// ============================================
// Card Title
// ============================================

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

export function CardTitle({ className = '', as: Component = 'h3', children, ...props }: CardTitleProps) {
  return (
    <Component
      className={`text-lg font-semibold leading-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}

// ============================================
// Card Description
// ============================================

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export function CardDescription({ className = '', children, ...props }: CardDescriptionProps) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`} {...props}>
      {children}
    </p>
  )
}

// ============================================
// Card Content
// ============================================

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className = '', children, ...props }: CardContentProps) {
  return (
    <div className={`pt-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

// ============================================
// Card Footer
// ============================================

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className = '', children, ...props }: CardFooterProps) {
  return (
    <div className={`flex items-center pt-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

// ============================================
// Stat Card - 统计卡片
// ============================================

interface StatCardProps {
  label: string
  value: string | number
  description?: string
  trend?: {
    value: number
    label?: string
  }
  icon?: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'destructive'
  onClick?: () => void
}

export function StatCard({
  label,
  value,
  description,
  trend,
  icon,
  variant = 'default',
  onClick,
}: StatCardProps) {
  const variantColors = {
    default: 'border-l-[hsl(var(--primary))]',
    success: 'border-l-[hsl(var(--success))]',
    warning: 'border-l-[hsl(var(--warning))]',
    destructive: 'border-l-[hsl(var(--destructive))]',
  }

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm
        transition-all duration-200 hover:shadow-md hover:border-[hsl(var(--primary))]/20
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
    >
      {/* 左侧色条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${variantColors[variant]}`} />
      
      <div className="pl-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon && (
            <div className="text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {icon}
            </div>
          )}
        </div>
        
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {trend && (
            <span
              className={`text-xs font-medium ${
                trend.value >= 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'
              }`}
            >
              {trend.value >= 0 ? '+' : ''}{trend.value}%
              {trend.label && <span className="ml-1 text-muted-foreground">{trend.label}</span>}
            </span>
          )}
        </div>
        
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}
