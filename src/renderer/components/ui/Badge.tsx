import React from 'react'

// ============================================
// SoloForge Design System - Badge 组件
// ============================================

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]',
  primary: 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20',
  secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border-transparent',
  success: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20',
  warning: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20',
  destructive: 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20',
  outline: 'bg-transparent text-foreground border-[hsl(var(--border))]',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
  lg: 'text-sm px-3 py-1.5',
}

export function Badge({
  className = '',
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        transition-colors duration-200
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`
            h-1.5 w-1.5 rounded-full
            ${variant === 'default' ? 'bg-muted-foreground' : ''}
            ${variant === 'primary' ? 'bg-primary' : ''}
            ${variant === 'success' ? 'bg-success' : ''}
            ${variant === 'warning' ? 'bg-warning' : ''}
            ${variant === 'destructive' ? 'bg-destructive' : ''}
            ${variant === 'secondary' ? 'bg-secondary-foreground' : ''}
            ${variant === 'outline' ? 'bg-foreground' : ''}
          `}
        />
      )}
      {children}
    </span>
  )
}

// ============================================
// Badge 组件已在上面定义
// StatusBadge 已移至 StatusBadge.tsx
// ============================================
