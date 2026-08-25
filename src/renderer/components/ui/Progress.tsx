import React from 'react'

// ============================================
// SoloForge Design System - Progress Components
// 进度展示组件
// ============================================

// ============================================
// Progress Bar - 进度条
// ============================================

interface ProgressBarProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
  label?: string
  className?: string
}

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
}

const variantStyles = {
  default: 'bg-[hsl(var(--primary))]',
  success: 'bg-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]',
  danger: 'bg-[hsl(var(--destructive))]',
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = false,
  label,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">
            {label || `${Math.round(percentage)}%`}
          </span>
          {showLabel && (
            <span className="font-medium text-[hsl(var(--foreground))]">
              {value} / {max}
            </span>
          )}
        </div>
      )}
      <div className={`w-full overflow-hidden rounded-full bg-[hsl(var(--muted))] ${sizeStyles[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${variantStyles[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// ============================================
// Progress Circle - 环形进度
// ============================================

interface ProgressCircleProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showValue?: boolean
  label?: string
  className?: string
}

const variantColors = {
  default: {
    stroke: 'hsl(var(--primary))',
    track: 'hsl(var(--muted))',
  },
  success: {
    stroke: 'hsl(var(--success))',
    track: 'hsl(var(--muted))',
  },
  warning: {
    stroke: 'hsl(var(--warning))',
    track: 'hsl(var(--muted))',
  },
  danger: {
    stroke: 'hsl(var(--destructive))',
    track: 'hsl(var(--muted))',
  },
}

export function ProgressCircle({
  value,
  max = 100,
  size = 80,
  strokeWidth = 6,
  variant = 'default',
  showValue = true,
  label,
  className = '',
}: ProgressCircleProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference
  const colors = variantColors[variant]

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 背景轨道 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        {/* 进度 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showValue && (
          <span className="text-lg font-bold text-[hsl(var(--foreground))]">
            {Math.round(percentage)}
          </span>
        )}
        {label && (
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================
// Progress Steps - 步骤进度
// ============================================

interface ProgressStep {
  label: string
  status: 'completed' | 'current' | 'pending' | 'error'
}

interface ProgressStepsProps {
  steps: ProgressStep[]
  currentStep?: number
  className?: string
}

export function ProgressSteps({ steps, currentStep, className = '' }: ProgressStepsProps) {
  const getStepStatus = (index: number, status: ProgressStep['status']) => {
    if (status === 'error') {
      return {
        bg: 'bg-[hsl(var(--destructive))]',
        border: 'border-[hsl(var(--destructive))]',
        text: 'text-white',
      }
    }
    if (status === 'completed' || index < (currentStep ?? 0)) {
      return {
        bg: 'bg-[hsl(var(--success))]',
        border: 'border-[hsl(var(--success))]',
        text: 'text-white',
      }
    }
    if (status === 'current' || index === currentStep) {
      return {
        bg: 'bg-[hsl(var(--primary))]',
        border: 'border-[hsl(var(--primary))]',
        text: 'text-white',
      }
    }
    return {
      bg: 'bg-[hsl(var(--muted))]',
      border: 'border-[hsl(var(--border))]',
      text: 'text-[hsl(var(--muted-foreground))]',
    }
  }

  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, index) => {
        const styles = getStepStatus(index, step.status)
        const isLast = index === steps.length - 1

        return (
          <React.Fragment key={index}>
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex h-8 w-8 items-center justify-center rounded-full border-2
                  text-sm font-semibold transition-all duration-300
                  ${styles.bg} ${styles.border} ${styles.text}
                `}
              >
                {step.status === 'completed' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : step.status === 'error' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span className={`mt-2 text-xs ${step.status === 'pending' ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`
                  mb-6 h-0.5 flex-1 transition-all duration-300
                  ${index < (currentStep ?? 0) ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--border))]'}
                `}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ============================================
// Score Circle - 健康评分环形图
// ============================================

interface ScoreCircleProps {
  score: number
  size?: number
  label?: string
  className?: string
}

export function ScoreCircle({
  score,
  size = 120,
  label,
  className = '',
}: ScoreCircleProps) {
  // 根据分数确定颜色
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-[hsl(var(--success))]'
    if (s >= 60) return 'text-[hsl(var(--warning))]'
    return 'text-[hsl(var(--destructive))]'
  }

  const getScoreGradient = (s: number) => {
    if (s >= 80) return { from: 'hsl(var(--success))', to: 'hsl(var(--success))' }
    if (s >= 60) return { from: 'hsl(var(--warning))', to: 'hsl(var(--warning))' }
    return { from: 'hsl(var(--destructive))', to: 'hsl(var(--destructive))' }
  }

  const colorClass = getScoreColor(score)
  const gradient = getScoreGradient(score)
  const percentage = Math.min(Math.max(score, 0), 100)
  const strokeWidth = size * 0.08
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 背景轨道 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* 渐变进度 */}
        <defs>
          <linearGradient id={`score-gradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradient.from} />
            <stop offset="100%" stopColor={gradient.to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#score-gradient-${score})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${colorClass}`}>
          {score}
        </span>
        {label && (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================
// Status Dot - 状态指示点
// ============================================

interface StatusDotProps {
  status: 'online' | 'offline' | 'degraded' | 'warning' | 'pending'
  pulse?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const dotColors = {
  online: 'bg-[hsl(var(--success))]',
  offline: 'bg-[hsl(var(--destructive))]',
  degraded: 'bg-[hsl(var(--warning))]',
  warning: 'bg-[hsl(var(--warning))]',
  pending: 'bg-[hsl(var(--primary))]',
}

const dotSizes = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
}

export function StatusDot({
  status,
  pulse = false,
  size = 'md',
  className = '',
}: StatusDotProps) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className={`
          rounded-full
          ${dotColors[status]}
          ${dotSizes[size]}
        `}
      />
      {pulse && (
        <span
          className={`
            absolute inline-flex h-full w-full rounded-full
            ${dotColors[status]}
            opacity-75
            animate-ping
          `}
        />
      )}
    </span>
  )
}
