import React, { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

// ============================================
// SoloForge Design System - Button 组件
// ============================================

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
    hover:bg-[hsl(var(--primary-hover))] hover:shadow-md
    active:scale-[0.98]
  `,
  secondary: `
    bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]
    hover:bg-[hsl(var(--secondary))]/80 hover:shadow-sm
    active:scale-[0.98]
  `,
  outline: `
    border border-[hsl(var(--border))] bg-transparent
    hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--accent))]
    active:scale-[0.98]
  `,
  ghost: `
    bg-transparent
    hover:bg-[hsl(var(--accent))]
    active:scale-[0.98]
  `,
  destructive: `
    bg-gradient-to-br from-[hsl(var(--destructive))] to-[hsl(var(--google-red)/0.85)] 
    text-[hsl(var(--destructive-foreground))]
    hover:opacity-90 hover:shadow-md
    active:scale-[0.98]
  `,
  link: `
    bg-transparent text-[hsl(var(--primary))] underline-offset-4
    hover:underline
  `,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
  icon: 'h-10 w-10 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className = '',
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    ...props
  },
  ref
) {
  const { t } = useTranslation()
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{t('common:loading')}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  )
})

// ============================================
// Icon Button - 图标按钮
// ============================================

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  label: string
  children: React.ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', variant = 'ghost', size = 'md', label, children, ...props },
  ref
) {
  const sizeStyles = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  }

  return (
    <button
      ref={ref}
      aria-label={label}
      className={`
        inline-flex items-center justify-center rounded-lg
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2
        disabled:pointer-events-none disabled:opacity-50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
})
