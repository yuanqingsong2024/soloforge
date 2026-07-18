export type StatusTone = 'success' | 'danger' | 'info' | 'warning' | 'muted'

export function getToneByStatus(
  status: string,
  mapping: Partial<Record<string, StatusTone>>,
  fallback: StatusTone = 'muted'
): StatusTone {
  return mapping[status] || fallback
}
