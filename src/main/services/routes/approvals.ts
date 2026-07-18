/**
 * Approvals / Audit Logs / Event Records 路由模块
 *
 * 路由清单：
 * - GET    /api/approvals                获取审批列表
 * - POST   /api/approvals                创建审批
 * - PUT    /api/approvals/:id            审批决策
 * - GET    /api/audit-logs               获取审计日志列表
 * - POST   /api/audit-logs               创建审计日志
 * - GET    /api/event-records            获取事件流
 * - GET    /api/event-records/:id        获取事件详情
 * - GET    /api/event-records/trace/:traceId  获取 Trace 事件链路
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { prisma, ok, fail, safeParseJson, toErrorMessage } from '../api-shared'
import { ApprovalExecutor } from '../approval-executor'
import { EventBusService } from '../event-bus'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface ApprovalDecisionBody {
  status: 'APPROVED' | 'REJECTED'
  approvedBy: string
}

// ==================== JSON Schema 定义 ====================

const createApprovalBodySchema = {
  body: {
    type: 'object',
    required: ['actionType', 'payload'],
    additionalProperties: false,
    properties: {
      ticketId: { type: 'string' },
      actionType: { type: 'string' },
      payload: { type: 'string' },
      requestedBy: { type: 'string' }
    }
  }
}

// ==================== 路由注册 ====================

export function registerApprovalRoutes(fastify: FastifyInstance): void {
  // ==================== Approvals ====================
  fastify.get('/api/approvals', async (request) => {
    const { status } = request.query as { status?: string }
    return await prisma.approval.findMany({
      where: status ? { status } : undefined,
      include: { ticket: true }
    })
  })

  fastify.post('/api/approvals', { schema: createApprovalBodySchema }, async (request) => {
    const data = request.body as {
      ticketId?: string
      actionType: string
      payload: string
      requestedBy?: string
    }
    return await prisma.approval.create({
      data: {
        ...(data.ticketId ? { ticketId: data.ticketId } : {}),
        actionType: data.actionType,
        payload: data.payload,
        status: 'PENDING',
        requestedBy: data.requestedBy || 'admin'
      }
    })
  })

  fastify.put('/api/approvals/:id', async (request) => {
    const { id } = request.params as { id: string }
    const { status, approvedBy } = request.body as ApprovalDecisionBody

    const updatedApproval = await prisma.approval.update({
      where: { id },
      data: {
        status,
        approvedBy,
        decidedAt: new Date()
      }
    })

    if (status === 'APPROVED') {
      // 已批准：委托给 ApprovalExecutor 执行对应动作
      const result = await ApprovalExecutor.executeApprovedAction(updatedApproval)
      return { ...updatedApproval, executionResult: result }
    }

    if (status === 'REJECTED') {
      // 已拒绝：委托给 ApprovalExecutor 执行回滚逻辑
      const result = await ApprovalExecutor.handleRejectedAction(updatedApproval)
      return { ...updatedApproval, executionResult: result }
    }

    return updatedApproval
  })

  // ==================== Audit Logs ====================
  fastify.get('/api/audit-logs', async (request) => {
    const { ticketId, traceId, actor } = request.query as { ticketId?: string; traceId?: string; actor?: string }
    return await prisma.auditLog.findMany({
      where: {
        ...(ticketId && { ticketId }),
        ...(traceId && { traceId }),
        ...(actor && { actor })
      },
      orderBy: { ts: 'desc' },
      take: 100
    })
  })

  fastify.post('/api/audit-logs', async (request) => {
    const data = request.body as {
      workspaceId?: string
      traceId?: string
      ticketId?: string
      actor: string
      action: string
      tool?: string
      approvalId?: string
      request: string
      response: string
    }
    await writeAuditLog({
      ...data,
      traceId: data.traceId || uuidv4()
    })
  })

  // ==================== Event Records / Activity Feed ====================
  fastify.get('/api/event-records', async (request, reply) => {
    const {
      workspaceId,
      targetId,
      severity,
      sourceType,
      eventType,
      traceId,
      startAt,
      endAt,
      limit
    } = request.query as {
      workspaceId?: string
      targetId?: string
      severity?: string
      sourceType?: string
      eventType?: string
      traceId?: string
      startAt?: string
      endAt?: string
      limit?: string
    }

    try {
      const rows = await EventBusService.list({
        workspaceId,
        targetId,
        severity,
        sourceType,
        eventType,
        traceId,
        startAt,
        endAt,
        limit: limit ? Number.parseInt(limit, 10) : undefined
      })
      type ListedEvent = Awaited<ReturnType<typeof EventBusService.list>>[number]

      return ok(rows.map((row: ListedEvent) => ({
        ...row,
        payload: safeParseJson<unknown>(row.payloadJson, {}),
        payloadJson: undefined
      })))
    } catch (error) {
      reply.code(500)
      return fail(`获取事件流失败：${toErrorMessage(error)}`)
    }
  })

  fastify.get('/api/event-records/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const row = await EventBusService.getById(id)
      if (!row) {
        reply.code(404)
        return fail('事件不存在')
      }
      return ok({
        ...row,
        payload: safeParseJson<unknown>(row.payloadJson, {}),
        payloadJson: undefined
      })
    } catch (error) {
      reply.code(500)
      return fail(`获取事件详情失败：${toErrorMessage(error)}`)
    }
  })

  fastify.get('/api/event-records/trace/:traceId', async (request, reply) => {
    const { traceId } = request.params as { traceId: string }
    try {
      const rows = await EventBusService.getTrace(traceId)
      type TracedEvent = Awaited<ReturnType<typeof EventBusService.getTrace>>[number]
      return ok(rows.map((row: TracedEvent) => ({
        ...row,
        payload: safeParseJson<unknown>(row.payloadJson, {}),
        payloadJson: undefined
      })))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Trace 事件链路失败：${toErrorMessage(error)}`)
    }
  })
}
