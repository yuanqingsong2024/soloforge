type HealthStatus = 'PASS' | 'WARN' | 'FAIL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'OPEN' | 'ACKED' | 'RESOLVED'

type HealthSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'WARN' | 'HIGH' | 'ERROR' | 'CRITICAL'

type HealthMetricKind = 'danger' | 'warning' | 'success'

const STATUS_CLASS_MAP: Record<HealthStatus, string> = {
  PASS: 'text-[hsl(var(--success-foreground))] bg-[hsl(var(--success)_/_0.12)]',
  WARN: 'text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning)_/_0.14)]',
  FAIL: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.10)]',
  ACTIVE: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.10)]',
  ACKNOWLEDGED: 'text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning)_/_0.12)]',
  OPEN: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.10)]',
  ACKED: 'text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning)_/_0.12)]',
  RESOLVED: 'text-[hsl(var(--success-foreground))] bg-[hsl(var(--success)_/_0.12)]'
}

const SEVERITY_CLASS_MAP: Record<HealthSeverity, string> = {
  CRITICAL: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.10)]',
  ERROR: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.10)]',
  HIGH: 'text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning)_/_0.14)]',
  WARN: 'text-[hsl(var(--warning-foreground))] bg-[hsl(var(--warning)_/_0.14)]',
  MEDIUM: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.10)]',
  LOW: 'text-[hsl(var(--google-blue))] bg-[hsl(var(--google-blue)_/_0.10)]',
  INFO: 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]'
}

const SEVERITY_BORDER_MAP: Record<HealthSeverity, string> = {
  CRITICAL: 'border-[hsl(var(--destructive)_/_0.22)]',
  ERROR: 'border-[hsl(var(--destructive)_/_0.22)]',
  HIGH: 'border-[hsl(var(--warning)_/_0.22)]',
  WARN: 'border-[hsl(var(--warning)_/_0.22)]',
  MEDIUM: 'border-[hsl(var(--primary)_/_0.22)]',
  LOW: 'border-[hsl(var(--google-blue)_/_0.22)]',
  INFO: 'border-[hsl(var(--border))]'
}

function isHealthStatus(value: string): value is HealthStatus {
  return value in STATUS_CLASS_MAP
}

function isHealthSeverity(value: string): value is HealthSeverity {
  return value in SEVERITY_CLASS_MAP
}

export function getHealthStatusBadgeClass(status: string): string {
  return isHealthStatus(status) ? STATUS_CLASS_MAP[status] : 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]'
}

export function getHealthSeverityBadgeClass(severity: string, bordered = false): string {
  const baseClass = isHealthSeverity(severity)
    ? SEVERITY_CLASS_MAP[severity]
    : 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]'

  if (!bordered) {
    return baseClass
  }

  const borderClass = isHealthSeverity(severity)
    ? SEVERITY_BORDER_MAP[severity]
    : 'border-[hsl(var(--border))]'

  return `${baseClass} ${borderClass}`
}

export function getHealthErrorPanelClass(): string {
  return 'rounded-workshop-md border border-[hsl(var(--destructive)_/_0.20)] bg-[hsl(var(--destructive)_/_0.08)] p-4'
}

export function getHealthMetricBadgeClass(kind: HealthMetricKind): string {
  switch (kind) {
    case 'danger':
      return 'bg-[hsl(var(--destructive)_/_0.10)] border-[hsl(var(--destructive)_/_0.20)] text-[hsl(var(--destructive))]'
    case 'warning':
      return 'bg-[hsl(var(--warning)_/_0.14)] border-[hsl(var(--warning)_/_0.20)] text-[hsl(var(--warning-foreground))]'
    case 'success':
      return 'bg-[hsl(var(--success)_/_0.12)] border-[hsl(var(--success)_/_0.20)] text-[hsl(var(--success-foreground))]'
  }
}

export function getHealthEnabledPillClass(enabled: boolean): string {
  return enabled
    ? 'bg-[hsl(var(--success)_/_0.12)] border-[hsl(var(--success)_/_0.20)] text-[hsl(var(--success-foreground))]'
    : 'bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
}
