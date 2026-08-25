import React from 'react'

// ============================================
// SoloForge Design System - Loading State
// 加载状态展示组件
// ============================================

interface LoadingStateProps {
  message?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
}

const sizeStyles = {
  sm: 'min-h-[8rem]',
  md: 'min-h-[12rem]',
  lg: 'min-h-[16rem]',
}

export function LoadingState({ 
  message = '加载中...', 
  className = '', 
  size = 'md',
  fullPage = false,
}: LoadingStateProps) {
  return (
    <div 
      className={`
        flex items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]
        ${fullPage ? 'min-h-full' : sizeStyles[size]}
        ${className}
      `}
    >
      <div className="flex flex-col items-center gap-4">
        {/* 主加载动画 */}
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[hsl(var(--muted))] border-t-[hsl(var(--primary))]" />
          {/* 光晕效果 */}
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[hsl(var(--primary))]/10" />
        </div>
        
        <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span>{message}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Skeleton - 骨架屏
// ============================================

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const variantStyles = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`
        animate-shimmer bg-[hsl(var(--muted))]
        ${variantStyles[variant]}
        ${className}
      `}
      style={style}
    />
  )
}

// ============================================
// Skeleton Card - 骨架卡片
// ============================================

interface SkeletonCardProps {
  lines?: number
  showAvatar?: boolean
  className?: string
}

export function SkeletonCard({ lines = 3, showAvatar = false, className = '' }: SkeletonCardProps) {
  return (
    <div className={`rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 ${className}`}>
      <div className="space-y-3">
        {showAvatar && (
          <div className="flex items-center gap-3">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
            </div>
          </div>
        )}
        
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton 
            key={i} 
            variant="text" 
            width={i === lines - 1 ? '70%' : '100%'} 
          />
        ))}
      </div>
    </div>
  )
}

// ============================================
// Skeleton List - 骨架列表
// ============================================

interface SkeletonListProps {
  count?: number
  showAvatar?: boolean
  className?: string
}

export function SkeletonList({ count = 5, showAvatar = false, className = '' }: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} showAvatar={showAvatar} />
      ))}
    </div>
  )
}
