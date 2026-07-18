import { prisma } from './db'

export interface NotificationPolicyFilters {
  workspaceId?: string
  enabled?: boolean
}

interface EventPayload {
  sourceType: string
  eventType: string
  severity: string
  title: string
  summary: string
  workspaceId: string
  targetId?: string | null
  traceId?: string | null
  payload: Record<string, unknown>
}

interface QuietHoursWindow {
  start: string
  end: string
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function matchesStringFilter(actual: string | null | undefined, filter: string[] | undefined): boolean {
  if (!filter || filter.length === 0) return true
  if (!actual) return false
  return filter.includes(actual)
}

function inQuietHours(quietHours: QuietHoursWindow | null): boolean {
  if (!quietHours) return false
  const now = new Date()
  const [startHour, startMinute] = quietHours.start.split(':').map(Number)
  const [endHour, endMinute] = quietHours.end.split(':').map(Number)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute

  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return false
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes
}

export class NotificationPolicyService {
  static async list(filters: NotificationPolicyFilters) {
    return await prisma.notificationPolicy.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {})
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  static async matchPolicies(event: EventPayload) {
    const policies = await prisma.notificationPolicy.findMany({
      where: {
        workspaceId: event.workspaceId,
        enabled: true
      },
      orderBy: { updatedAt: 'desc' }
    })

    return policies.filter(policy => {
      const eventFilters = safeParseJson<{ sourceType?: string[]; eventType?: string[]; severity?: string[] }>(policy.eventFilters, {})
      const targetFilters = safeParseJson<{ targetIds?: string[] }>(policy.targetFilters, {})
      const quietHours = safeParseJson<QuietHoursWindow | null>(policy.quietHoursJson, null)

      if (inQuietHours(quietHours)) return false
      if (!matchesStringFilter(event.sourceType, eventFilters.sourceType)) return false
      if (!matchesStringFilter(event.eventType, eventFilters.eventType)) return false
      if (!matchesStringFilter(event.severity, eventFilters.severity)) return false
      if (!matchesStringFilter(event.targetId || null, targetFilters.targetIds)) return false

      return true
    })
  }

  static renderPolicyMessage(input: {
    policyName: string
    event: EventPayload
  }): { subject: string; body: string } {
    const subject = `[${input.event.severity}] ${input.event.eventType}`
    const body = [
      `策略：${input.policyName}`,
      `事件：${input.event.title}`,
      `摘要：${input.event.summary}`,
      `来源：${input.event.sourceType} / ${input.event.eventType}`,
      `Workspace：${input.event.workspaceId}`,
      input.event.targetId ? `Target：${input.event.targetId}` : null,
      input.event.traceId ? `Trace：${input.event.traceId}` : null
    ].filter(Boolean).join('\n')

    return { subject, body }
  }
}

export { prisma } from './db'
