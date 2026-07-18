type StatusTone = 'success' | 'danger' | 'info' | 'warning' | 'muted'

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

const toneClassMap: Record<StatusTone, string> = {
  success: 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]',
  danger: 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]',
  info: 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]',
  warning: 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]',
  muted: 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
}

export function StatusBadge({ label, tone = 'muted', className = '' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClassMap[tone]} ${className}`}>
      {label}
    </span>
  )
}
