import { type Job } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from './db'
import { writeAuditLog } from './audit-log-writer'

export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
export type SupportedJobType = 'APPLY_CONFIG' | 'SYNC_STATE' | 'DOCTOR_CHECK'

const SERVICE_ACTOR = 'job-manager'
const SUPPORTED_JOB_TYPES: SupportedJobType[] = ['APPLY_CONFIG', 'SYNC_STATE', 'DOCTOR_CHECK']

export function isSupportedJobType(type: string): type is SupportedJobType {
  return SUPPORTED_JOB_TYPES.includes(type as SupportedJobType)
}

export function getSupportedJobTypes(): SupportedJobType[] {
  return [...SUPPORTED_JOB_TYPES]
}

function safeJsonStringify(data: unknown, fieldLabel: string): string {
  try {
    return JSON.stringify(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldLabel} 序列化失败: ${message}`)
  }
}

export class JobManager {
  /**
   * 创建 Job
   */
  static async createJob(
    ticketId: string,
    type: string,
    request: unknown,
    stepOrder?: number
  ): Promise<Job> {
    const traceId = uuidv4()
    const normalizedType = type.trim()

    if (!isSupportedJobType(normalizedType)) {
      throw new Error(`当前 Job 类型暂未支持: ${normalizedType}`)
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      throw new Error('工单不存在')
    }

    const job = await prisma.job.create({
      data: {
        ticketId,
        workspaceId: ticket.workspaceId,
        stepOrder: stepOrder ?? null,
        type: normalizedType,
        status: 'PENDING',
        traceId,
        request: safeJsonStringify(request, 'Job.request'),
        result: null,
        logs: null
      }
    })

    await writeAuditLog({
      actor: SERVICE_ACTOR,
      ticketId,
      traceId,
      action: 'JOB_CREATED',
      tool: 'job',
      request: { ticketId, type: normalizedType, stepOrder: stepOrder ?? null },
      response: { jobId: job.id, workspaceId: job.workspaceId, status: job.status }
    })

    return job
  }

  /**
   * 更新 Job 状态
   */
  static async updateJobStatus(
    jobId: string,
    status: JobStatus,
    result?: unknown,
    logs?: string
  ): Promise<Job> {
    const existing = await prisma.job.findUnique({ where: { id: jobId } })
    if (!existing) {
      throw new Error('Job 不存在')
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        result: result === undefined ? existing.result : safeJsonStringify(result, 'Job.result'),
        logs: logs === undefined ? existing.logs : logs
      }
    })

    await writeAuditLog({
      actor: SERVICE_ACTOR,
      ticketId: updated.ticketId ?? undefined,
      traceId: updated.traceId,
      action: 'JOB_STATUS_UPDATED',
      tool: 'job',
      request: {
        jobId,
        fromStatus: existing.status,
        toStatus: status
      },
      response: { jobId, status: updated.status }
    })

    return updated
  }

  /**
   * 重试失败的 Job（会创建一个新的 Job 记录，保留历史）
   */
  static async retryJob(jobId: string): Promise<Job> {
    const existing = await prisma.job.findUnique({ where: { id: jobId } })
    if (!existing) throw new Error('Job 不存在')
    if (existing.status !== 'FAILED') {
      throw new Error('仅允许重试状态为 FAILED 的 Job')
    }
    if (!isSupportedJobType(existing.type)) {
      throw new Error(`当前 Job 类型暂未支持: ${existing.type}`)
    }

    const newTraceId = uuidv4()
    const newJob = await prisma.job.create({
      data: {
        ticketId: existing.ticketId,
        stepOrder: existing.stepOrder,
        type: existing.type,
        status: 'PENDING',
        traceId: newTraceId,
        request: existing.request,
        result: null,
        logs: null
      }
    })

    await writeAuditLog({
      actor: SERVICE_ACTOR,
      ticketId: existing.ticketId ?? undefined,
      traceId: newTraceId,
      action: 'JOB_RETRIED',
      tool: 'job',
      request: {
        oldJobId: existing.id,
        oldTraceId: existing.traceId,
        newJobId: newJob.id,
        newTraceId,
        type: existing.type,
        stepOrder: existing.stepOrder
      },
      response: { status: newJob.status }
    })

    return newJob
  }
}

export { prisma } from './db'
