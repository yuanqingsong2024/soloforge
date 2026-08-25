// ============================================
// SoloForge Design System - Status Badge V2
// 状态徽章组件
// ============================================

type StatusTone = 'success' | 'danger' | 'info' | 'warning' | 'muted'

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}

const toneClassMap: Record<StatusTone, string> = {
  success: 'border-[hsl(var(--google-green)/0.25)] bg-gradient-to-br from-[hsl(var(--google-green)/0.12)] to-[hsl(var(--google-green)/0.04)] text-[hsl(var(--success))]',
  danger: 'border-[hsl(var(--google-red)/0.25)] bg-gradient-to-br from-[hsl(var(--google-red)/0.12)] to-[hsl(var(--google-red)/0.04)] text-[hsl(var(--destructive))]',
  info: 'border-[hsl(var(--google-blue)/0.25)] bg-gradient-to-br from-[hsl(var(--google-blue)/0.12)] to-[hsl(var(--google-blue)/0.04)] text-[hsl(var(--google-blue))]',
  warning: 'border-[hsl(var(--google-yellow)/0.35)] bg-gradient-to-br from-[hsl(var(--google-yellow)/0.2)] to-[hsl(var(--google-yellow)/0.08)] text-[hsl(var(--foreground))]',
  muted: 'border-[hsl(var(--border)/0.6)] bg-gradient-to-br from-[hsl(var(--muted))] to-[hsl(var(--muted)/0.5)] text-[hsl(var(--muted-foreground))]'
}

const sizeClassMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm'
}

export function StatusBadge({ 
  label, 
  tone = 'muted', 
  className = '',
  size = 'md',
  pulse = false
}: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-all ${toneClassMap[tone]} ${sizeClassMap[size]} ${className}`}>
      {pulse && (
        <span className={`h-1.5 w-1.5 rounded-full bg-current animate-pulse-status`} />
      )}
      {label}
    </span>
  )
}

// ============================================
// Status Dot - 状态指示点
// ============================================

interface StatusDotProps {
  status: 'online' | 'offline' | 'degraded' | 'pending' | 'running' | 'success' | 'error' | 'warning'
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
  className?: string
}

const statusDotMap: Record<StatusDotProps['status'], string> = {
  online: 'bg-[hsl(var(--success))]',
  success: 'bg-[hsl(var(--success))]',
  running: 'bg-[hsl(var(--google-blue))]',
  pending: 'bg-[hsl(var(--warning))]',
  degraded: 'bg-[hsl(var(--warning))]',
  warning: 'bg-[hsl(var(--warning))]',
  offline: 'bg-[hsl(var(--muted-foreground))]',
  error: 'bg-[hsl(var(--destructive))]',
}

const sizeDotMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5'
}

export function StatusDot({ status, size = 'md', pulse, className = '' }: StatusDotProps) {
  const shouldPulse = pulse ?? (status === 'online' || status === 'running')
  
  return (
    <span 
      className={`inline-block rounded-full ${statusDotMap[status]} ${sizeDotMap[size]} ${shouldPulse ? 'animate-pulse-status' : ''} ${className}`} 
      title={status}
    />
  )
}
