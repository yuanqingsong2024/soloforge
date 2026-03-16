import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export type EventSourceType = 'CONFIG' | 'CHANGE_REQUEST' | 'DEPLOYMENT_JOB' | 'DOCTOR' | 'BACKUP' | 'SYSTEM' | 'COMMUNICATION' | 'HOST_AGENT'
export type EventSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

export interface EmitEventInput {
  workspaceId: string
  targetId?: string | null
  sourceType: EventSourceType
  sourceId: string
  eventType: string
  severity: EventSeverity
  title: string
  summary: string
  payload: unknown
  traceId?: string | null
}

export interface EventRecordFilters {
  workspaceId?: string
  targetId?: string
  severity?: string
  sourceType?: string
  eventType?: string
  traceId?: string
  startAt?: string
  endAt?: string
  limit?: number
}

/**
 * 统一事件总线服务
 * 为 Activity Feed、通知策略与运行态控制中心提供共享事件层。
 */
export class EventBusService {
  /**
   * 写入事件记录
   */
  static async emit(input: EmitEventInput) {
    return await prisma.eventRecord.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.targetId || null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        eventType: input.eventType,
        severity: input.severity,
        title: input.title,
        summary: input.summary,
        payloadJson: JSON.stringify(input.payload ?? {}),
        traceId: input.traceId || null
      }
    })
  }

  /**
   * 查询事件流
   */
  static async list(filters: EventRecordFilters) {
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500)
    return await prisma.eventRecord.findMany({
      where: {
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.targetId ? { targetId: filters.targetId } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
        ...(filters.traceId ? { traceId: filters.traceId } : {}),
        ...((filters.startAt || filters.endAt)
          ? {
              createdAt: {
                ...(filters.startAt ? { gte: new Date(filters.startAt) } : {}),
                ...(filters.endAt ? { lte: new Date(filters.endAt) } : {})
              }
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  /**
   * 查询单条事件
   */
  static async getById(id: string) {
    return await prisma.eventRecord.findUnique({ where: { id } })
  }

  /**
   * 根据 Trace ID 查询完整链路
   */
  static async getTrace(traceId: string) {
    return await prisma.eventRecord.findMany({
      where: { traceId },
      orderBy: { createdAt: 'asc' }
    })
  }
}

export { prisma }
