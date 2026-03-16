import { PrismaClient, type Job } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient()

export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

const SERVICE_ACTOR = 'job-manager'

function safeJsonStringify(data: unknown, fieldLabel: string): string {
  try {
    return JSON.stringify(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldLabel} 序列化失败: ${message}`)
  }
}

async function writeAuditLog(input: {
  ticketId?: string
  traceId: string
  actor?: string
  action: string
  tool?: string
  request: unknown
  response: unknown
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ticketId: input.ticketId,
      traceId: input.traceId,
      actor: input.actor || SERVICE_ACTOR,
      action: input.action,
      tool: input.tool,
      request: safeJsonStringify(input.request, 'AuditLog.request'),
      response: safeJsonStringify(input.response, 'AuditLog.response'),
      ts: new Date()
    }
  })
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

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      throw new Error('工单不存在')
    }

    const job = await prisma.job.create({
      data: {
        ticketId,
        stepOrder: stepOrder ?? null,
        type,
        status: 'PENDING',
        traceId,
        request: safeJsonStringify(request, 'Job.request'),
        result: null,
        logs: null
      }
    })

    await writeAuditLog({
      ticketId,
      traceId,
      action: 'JOB_CREATED',
      tool: 'job',
      request: { ticketId, type, stepOrder: stepOrder ?? null },
      response: { jobId: job.id, status: job.status }
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

export { prisma }
