/**
 * Pipelines / Jobs / Webhooks / Outbox 路由模块
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { PipelineManager } from '../pipeline-manager'
import { JobExecutor } from '../job-executor'
import { getSupportedJobTypes, isSupportedJobType, JobManager, type JobStatus } from '../job-manager'
import { OutboxManager } from '../outbox-manager'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  writeApiAuditLog,
  emitApiEvent,
  isPlainRecord,
  readRequiredString
} from '../api-shared'

// ==================== 类型定义 ====================

interface CreateJobBody {
  ticketId: string
  type: string
  request?: unknown
  stepOrder?: number
}

// ==================== 辅助函数 ====================

function validateCreateJobBody(raw: unknown): { ticketId: string; type: string; request: unknown; stepOrder?: number } {
  if (!isPlainRecord(raw)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  const ticketId = readRequiredString(raw, 'ticketId')
  const type = readRequiredString(raw, 'type')
  if (!isSupportedJobType(type)) {
    throw new Error(`当前 Job 类型暂未支持: ${type}。当前支持: ${getSupportedJobTypes().join(', ')}`)
  }
  const stepOrder = raw.stepOrder
  if (stepOrder !== undefined && (typeof stepOrder !== 'number' || !Number.isInteger(stepOrder) || stepOrder < 0)) {
    throw new Error('stepOrder 必须是非负整数')
  }
  return {
    ticketId,
    type,
    request: raw.request ?? {},
    stepOrder
  }
}

// ==================== 路由注册 ====================

export function registerJobsRoutes(fastify: FastifyInstance): void {
  // ==================== Pipelines ====================
  fastify.get('/api/pipelines', async (_request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    try {
      const pipelines = await prisma.pipeline.findMany({
        include: { steps: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'asc' }
      })
  
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'PIPELINE_LIST',
        tool: 'pipeline',
        request: {},
        response: { count: pipelines.length }
      })
  
      return ok(pipelines)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'PIPELINE_LIST',
        tool: 'pipeline',
        request: {},
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取 Pipeline 列表失败：${errMsg}`)
    }
  })
  
  fastify.get('/api/pipelines/:id', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }
  
      const pipeline = await prisma.pipeline.findUnique({
        where: { id },
        include: { steps: { orderBy: { order: 'asc' } } }
      })
      if (!pipeline) {
        reply.code(404)
        await writeApiAuditLog({
          traceId,
          actor,
          action: 'PIPELINE_GET',
          tool: 'pipeline',
          request: { id },
          response: fail('Pipeline 不存在')
        })
        return fail('Pipeline 不存在')
      }
  
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'PIPELINE_GET',
        tool: 'pipeline',
        request: { id },
        response: { pipelineId: pipeline.id }
      })
  
      return ok(pipeline)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'PIPELINE_GET',
        tool: 'pipeline',
        request: { id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取 Pipeline 失败：${errMsg}`)
    }
  })
  
  fastify.get('/api/tickets/:id/pipeline', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id: ticketId } = request.params as { id: string }
  
    try {
      if (!ticketId) {
        reply.code(400)
        return fail('ticketId 不能为空')
      }
  
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) {
        reply.code(404)
        await writeApiAuditLog({
          traceId,
          ticketId,
          actor,
          action: 'TICKET_PIPELINE_GET',
          tool: 'pipeline',
          request: { ticketId },
          response: fail('工单不存在')
        })
        return fail('工单不存在')
      }
  
      const state = await prisma.$transaction(async (tx) => {
        const existing = await tx.ticketPipelineState.findUnique({
          where: { ticketId },
          include: { pipeline: { include: { steps: true } } }
        })
        if (existing) return existing
  
        const pipeline = await tx.pipeline.findFirst({
          where: { enabled: true },
          orderBy: { createdAt: 'asc' },
          include: { steps: { orderBy: { order: 'asc' } } }
        })
        if (!pipeline) {
          throw new Error('未找到可用的 Pipeline（enabled=true）')
        }
        if (pipeline.steps.length === 0) {
          throw new Error('可用 Pipeline 未配置任何步骤')
        }
  
        const first = pipeline.steps[0]
        return await tx.ticketPipelineState.create({
          data: {
            ticketId,
            pipelineId: pipeline.id,
            currentStepOrder: first.order,
            status: 'RUNNING'
          },
          include: { pipeline: { include: { steps: true } } }
        })
      })
  
      const stepsSorted = state.pipeline.steps.slice().sort((a, b) => a.order - b.order)
      const currentStep = stepsSorted.find(s => s.order === state.currentStepOrder) || null
      const needsApproval = currentStep ? PipelineManager.requiresApproval(currentStep) : false
  
      await writeApiAuditLog({
        traceId,
        ticketId,
        actor,
        action: 'TICKET_PIPELINE_GET',
        tool: 'pipeline',
        request: { ticketId },
        response: { pipelineId: state.pipelineId, currentStepOrder: state.currentStepOrder, status: state.status }
      })
  
      return ok({
        ticketId,
        state: {
          id: state.id,
          pipelineId: state.pipelineId,
          currentStepOrder: state.currentStepOrder,
          status: state.status,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt
        },
        pipeline: {
          id: state.pipeline.id,
          name: state.pipeline.name,
          enabled: state.pipeline.enabled,
          steps: stepsSorted
        },
        currentStep,
        needsApproval
      })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        ticketId,
        actor,
        action: 'TICKET_PIPELINE_GET',
        tool: 'pipeline',
        request: { ticketId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取工单 Pipeline 状态失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/tickets/:id/pipeline/advance', async (request, reply) => {
    const { id: ticketId } = request.params as { id: string }
    const traceId = uuidv4()
    const body = request.body as { actor?: string }
    const actor = (body.actor || 'admin').trim()
  
    try {
      if (!ticketId) {
        reply.code(400)
        return fail('ticketId 不能为空')
      }
      if (!actor) {
        reply.code(400)
        return fail('actor 不能为空')
      }
  
      const result = await PipelineManager.advanceStep(ticketId, actor)
      await writeApiAuditLog({
        traceId: result.traceId || traceId,
        ticketId,
        actor,
        action: 'PIPELINE_ADVANCE_API',
        tool: 'pipeline',
        request: { ticketId },
        response: result
      })
  
      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        ticketId,
        actor,
        action: 'PIPELINE_ADVANCE_API',
        tool: 'pipeline',
        request: { ticketId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`推进 Pipeline 失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/tickets/:id/pipeline/rollback', async (request, reply) => {
    const { id: ticketId } = request.params as { id: string }
    const traceId = uuidv4()
    const body = request.body as { actor?: string }
    const actor = (body.actor || 'admin').trim()
  
    try {
      if (!ticketId) {
        reply.code(400)
        return fail('ticketId 不能为空')
      }
      if (!actor) {
        reply.code(400)
        return fail('actor 不能为空')
      }
  
      const result = await PipelineManager.rollbackStep(ticketId, actor)
      await writeApiAuditLog({
        traceId: result.traceId || traceId,
        ticketId,
        actor,
        action: 'PIPELINE_ROLLBACK_API',
        tool: 'pipeline',
        request: { ticketId },
        response: result
      })
      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        ticketId,
        actor,
        action: 'PIPELINE_ROLLBACK_API',
        tool: 'pipeline',
        request: { ticketId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`回退 Pipeline 失败：${errMsg}`)
    }
  })
  
  // ==================== Jobs ====================
  fastify.get('/api/jobs', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { ticketId } = request.query as { ticketId?: string }
  
    try {
      const where = ticketId ? { ticketId } : undefined
      const jobs = await prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200
      })
  
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId,
        action: 'JOB_LIST',
        tool: 'job',
        request: { ticketId: ticketId || null },
        response: { count: jobs.length }
      })
  
      return ok(jobs)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId,
        action: 'JOB_LIST',
        tool: 'job',
        request: { ticketId: ticketId || null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取 Jobs 列表失败：${errMsg}`)
    }
  })
  
  fastify.get('/api/jobs/:id', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }
      const job = await prisma.job.findUnique({ where: { id } })
      if (!job) {
        reply.code(404)
        await writeApiAuditLog({
          traceId,
          actor,
          action: 'JOB_GET',
          tool: 'job',
          request: { id },
          response: fail('Job 不存在')
        })
        return fail('Job 不存在')
      }
  
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId: job.ticketId ?? undefined,
        action: 'JOB_GET',
        tool: 'job',
        request: { id },
        response: { id: job.id, status: job.status }
      })
      return ok(job)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'JOB_GET',
        tool: 'job',
        request: { id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取 Job 失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/jobs', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    let body: CreateJobBody
  
    try {
      body = validateCreateJobBody(request.body)
    } catch (error) {
      reply.code(400)
      return fail(toErrorMessage(error))
    }
  
    try {
      const job = await JobManager.createJob(body.ticketId, body.type, body.request ?? {}, body.stepOrder)
  
      await writeApiAuditLog({
        traceId: job.traceId || traceId,
        actor,
        ticketId: job.ticketId ?? undefined,
        action: 'JOB_CREATE_API',
        tool: 'job',
        request: { ticketId: body.ticketId, type: body.type, stepOrder: body.stepOrder ?? null },
        response: { jobId: job.id, status: job.status }
      })
  
      await emitApiEvent({
        workspaceId: job.workspaceId,
        sourceType: 'SYSTEM',
        sourceId: job.id,
        eventType: 'JOB_CREATED',
        severity: 'INFO',
        title: `Job 已创建：${job.type}`,
        summary: `Job ${job.id} 已创建，等待执行`,
        payload: { jobId: job.id, type: job.type, ticketId: job.ticketId },
        traceId: job.traceId || traceId
      })
  
      return ok(job)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId: body.ticketId,
        action: 'JOB_CREATE_API',
        tool: 'job',
        request: { ticketId: body.ticketId, type: body.type, stepOrder: body.stepOrder ?? null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`创建 Job 失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/jobs/:id/execute', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }
  
      const result = await JobExecutor.execute(id)
  
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'JOB_EXECUTE_API',
        tool: 'job',
        request: { jobId: id },
        response: result
      })
  
      if (!result.success) {
        reply.code(500)
        return fail(result.error || 'Job 执行失败')
      }
      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'JOB_EXECUTE_API',
        tool: 'job',
        request: { jobId: id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`执行 Job 失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/jobs/:id/retry', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }
  
      const newJob = await JobManager.retryJob(id)
      await writeApiAuditLog({
        traceId: newJob.traceId || traceId,
        actor,
        ticketId: newJob.ticketId ?? undefined,
        action: 'JOB_RETRY_API',
        tool: 'job',
        request: { jobId: id },
        response: { newJobId: newJob.id, status: newJob.status }
      })
      return ok(newJob)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'JOB_RETRY_API',
        tool: 'job',
        request: { jobId: id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`重试 Job 失败：${errMsg}`)
    }
  })
  
  // ==================== Webhooks ====================
  interface OpenClawJobResultBody {
    trace_id: string
    job_id: string
    status: JobStatus
    result?: unknown
    logs?: string
  }
  
  fastify.post('/webhooks/openclaw/job_result', async (request, reply) => {
    const body = request.body as OpenClawJobResultBody
    const actor = 'openclaw'
    const traceId = (body?.trace_id || '').trim() || uuidv4()
  
    try {
      if (!body || !body.trace_id || !body.job_id) {
        reply.code(400)
        return fail('trace_id 与 job_id 必填')
      }
      if (!body.status) {
        reply.code(400)
        return fail('status 必填')
      }
  
      // 幂等检查：基于 trace_id + job_id
      const existing = await prisma.job.findFirst({
        where: { traceId: body.trace_id, id: body.job_id }
      })
      if (!existing) {
        reply.code(404)
        await writeApiAuditLog({
          traceId,
          actor,
          action: 'WEBHOOK_JOB_RESULT',
          tool: 'webhook',
          request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
          response: fail('Job 不存在或 trace_id 不匹配')
        })
        return fail('Job 不存在或 trace_id 不匹配')
      }
      if (existing && existing.status !== 'PENDING') {
        await writeApiAuditLog({
          traceId,
          actor,
          ticketId: existing.ticketId ?? undefined,
          action: 'WEBHOOK_JOB_RESULT',
          tool: 'webhook',
          request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
          response: { message: '已处理（幂等）', jobId: existing.id, status: existing.status }
        })
        return ok({ message: '已处理（幂等）', job: existing })
      }
  
      const updated = await JobManager.updateJobStatus(existing.id, body.status, body.result, body.logs)
  
      await writeApiAuditLog({
        traceId,
        actor,
        ticketId: updated.ticketId ?? undefined,
        action: 'WEBHOOK_JOB_RESULT',
        tool: 'webhook',
        request: { trace_id: body.trace_id, job_id: body.job_id, status: body.status },
        response: { jobId: updated.id, status: updated.status }
      })
  
      return ok({ message: '已更新', job: updated })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'WEBHOOK_JOB_RESULT',
        tool: 'webhook',
        request: { trace_id: body?.trace_id, job_id: body?.job_id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`处理 webhook 失败：${errMsg}`)
    }
  })
  
  // ==================== Outbox ====================
  fastify.get('/api/outbox', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { status } = request.query as { status?: string }
  
    try {
      const allowed = new Set(['PENDING', 'SENDING', 'SUCCEEDED', 'FAILED'])
      if (status !== undefined && !allowed.has(status)) {
        reply.code(400)
        return fail('status 参数非法')
      }
  
      const events = await prisma.outboxEvent.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 200
      })
  
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'OUTBOX_LIST',
        tool: 'outbox',
        request: { status: status || null },
        response: { count: events.length }
      })
  
      return ok(events)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'OUTBOX_LIST',
        tool: 'outbox',
        request: { status: status || null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取 Outbox 列表失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/outbox/:id/retry', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }
  
      const result = await OutboxManager.manualRetry(id)
      await writeApiAuditLog({
        traceId: result.traceId || traceId,
        actor,
        action: 'OUTBOX_RETRY_API',
        tool: 'outbox',
        request: { eventId: id },
        response: result
      })
  
      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'OUTBOX_RETRY_API',
        tool: 'outbox',
        request: { eventId: id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`重试 Outbox 事件失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/outbox/retry-due', async (_request, reply) => {
    const traceId = uuidv4()
    const actor = 'system'
    try {
      const stats = await OutboxManager.processRetries()
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'OUTBOX_RETRY_DUE',
        tool: 'outbox',
        request: {},
        response: stats
      })
      return ok(stats)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'OUTBOX_RETRY_DUE',
        tool: 'outbox',
        request: {},
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`批量重试到期 Outbox 事件失败：${errMsg}`)
    }
  })
  
}
