export interface EventRecord {
  id: string
  workspaceId: string
  targetId?: string | null
  sourceType: string
  sourceId: string
  eventType: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | string
  title: string
  summary: string
  payload: unknown
  traceId?: string | null
  createdAt: string
}
