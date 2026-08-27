/**
 * Outbound Messages 路由模块 - 外发消息管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalGuard } from '../approval-guard'
import {
  prisma,
  maskTarget,
  computeContentHash,
  computeIdempotencyKey,
  MAX_RETRY_ATTEMPTS,
  type OutboundMessageStatus
} from '../api-shared'
import { dispatchOutboundMessage } from '../openclaw-helpers'
import { writeAuditLogStrict } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface UpdateOutboundMessageBody {
  channel?: string
  to?: string
  subject?: string | null
  body?: string
  status?: OutboundMessageStatus
  lastError?: string | null
}

interface SendExternalApprovalPayload {
  outboundMessageId: string
  traceId: string
  channel: string
  to: string
}

// ==================== JSON Schema 定义 ====================

const createOutboundMessageBodySchema = {
  body: {
    type: 'object',
    required: ['channel', 'to', 'body'],
    additionalProperties: false,
    properties: {
      ticketId: { type: 'string' },
      artifactId: { type: 'string' },
      templateId: { type: 'string' },
      provider: { type: 'string' },
      channel: { type: 'string', minLength: 1 },
      to: { type: 'string', minLength: 1 },
      subject: { type: 'string' },
      body: { type: 'string', minLength: 1 },
      status: { type: 'string' },
      traceId: { type: 'string' },
      approvalId: { type: 'string' }
    }
  }
}

// ==================== 路由注册 ====================

export function registerOutboundMessagesRoutes(fastify: FastifyInstance): void {
  // 获取外发消息列表
  fastify.get('/api/outbound-messages', async (request) => {
    const { status, ticketId, contactId, channel } = request.query as {
      status?: OutboundMessageStatus
      ticketId?: string
      contactId?: string
      channel?: string
    }
    return await prisma.outboundMessage.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(ticketId ? { ticketId } : {}),
        ...(channel ? { channel } : {}),
        ...(contactId ? { ticket: { contactId } } : {})
      },
      include: {
        ticket: true,
        artifact: true
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  // 创建外发消息
  fastify.post('/api/outbound-messages', { schema: createOutboundMessageBodySchema }, async (request) => {
    const { ticketId, artifactId, approvalId, templateId, provider, channel, to, subject, body, status } = request.body as {
      ticketId?: string
      artifactId?: string
      approvalId?: string
      templateId?: string
      provider?: string
      channel: string
      to: string
      subject?: string
      body: string
      status?: string
      idempotencyKey?: string
    }
    const contentHash = computeContentHash({ channel, to, subject: subject || null, body })
    const idempotencyKey = computeIdempotencyKey({
      ticketId: ticketId || null,
      templateId: templateId || null,
      channel,
      to,
      subject: subject || null,
      body
    })

    const existing = await prisma.outboundMessage.findUnique({ where: { idempotencyKey } })
    if (existing) {
      return existing
    }

    const traceId = uuidv4()
    return await prisma.outboundMessage.create({
      data: {
        ticketId: ticketId || null,
        artifactId: artifactId || null,
        approvalId: approvalId || null,
        templateId: templateId || null,
        provider: provider || 'openclaw',
        channel,
        to,
        toMasked: maskTarget(to),
        subject: subject || null,
        body,
        status: status || 'DRAFT',
        idempotencyKey,
        traceId,
        contentHash
      }
    })
  })

  // 更新外发消息
  fastify.put('/api/outbound-messages/:id', async (request) => {
    const { id } = request.params as { id: string }
    const { channel, to, subject, body, status, lastError } = request.body as UpdateOutboundMessageBody
    const current = await prisma.outboundMessage.findUnique({ where: { id } })
    if (!current) {
      throw new Error('外发消息不存在')
    }

    const nextChannel = channel ?? current.channel
    const nextTo = to ?? current.to
    const nextSubject = subject ?? current.subject
    const nextBody = body ?? current.body
    const nextContentHash = computeContentHash({ channel: nextChannel, to: nextTo, subject: nextSubject, body: nextBody })

    return await prisma.outboundMessage.update({
      where: { id },
      data: {
        ...(channel !== undefined ? { channel } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(to !== undefined ? { toMasked: maskTarget(to) } : {}),
        ...(subject !== undefined ? { subject } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(lastError !== undefined ? { lastError } : {}),
        contentHash: nextContentHash
      }
    })
  })

  // 发送外发消息
  fastify.post('/api/outbound-messages/:id/send', async (request) => {
    const { id } = request.params as { id: string }
    const actor = 'admin'

    let message:
      | (Awaited<ReturnType<typeof prisma.outboundMessage.findUnique>>)
      | null = null

    try {
      message = await prisma.outboundMessage.findUnique({ where: { id } })
      if (!message) {
        throw new Error('外发消息不存在')
      }

      if (message.status !== 'DRAFT' && message.status !== 'APPROVED') {
        throw new Error('仅 DRAFT 或 APPROVED 状态允许发送')
      }

      const outboundMessageId = message.id
      const ticketId = message.ticketId || undefined
      const provider = message.provider
      const templateId = message.templateId || undefined
      const existingApprovalId = message.approvalId || undefined
      const msgTraceId = message.traceId
      const channel = message.channel
      const toMasked = maskTarget(message.to)

      const approvalPayload: SendExternalApprovalPayload = {
        outboundMessageId,
        traceId: msgTraceId,
        channel,
        to: toMasked
      }

      // 已审批的消息允许直接发送（避免重复创建审批）
      if (message.status === 'APPROVED') {
        let result: unknown
        try {
          result = await dispatchOutboundMessage(outboundMessageId, actor)
        } catch (sendError) {
          // dispatchOutboundMessage 内部已执行 FAILED 状态更新，
          // 此处 catch 仅将错误信息附加到响应返回，不返回 500 保证 sendResult 可赋值
          const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
          try {
            await prisma.outboundMessage.update({
              where: { id: outboundMessageId },
              data: { status: 'FAILED', lastError: errMsg }
            })
          } catch {
            // 状态更新失败不影响错误感知
          }
          return { status: 'failed', error: errMsg }
        }

        await writeAuditLogStrict({
          ticketId,
          traceId: msgTraceId,
          actor,
          action: 'OUTBOUND_SEND_REQUESTED',
          tool: provider,
          approvalId: existingApprovalId,
          templateId,
          outboundMessageId,
          request: approvalPayload,
          response: { dispatched: true, via: 'already_approved' }
        })

        return { status: 'sent', result }
      }

      const approvalResult = await ApprovalGuard.executeProtected(
        'SEND_EXTERNAL',
        approvalPayload,
        actor,
        async () => {
          return await dispatchOutboundMessage(outboundMessageId, actor)
        },
        ticketId
      )

      if (approvalResult.needsApproval) {
        await prisma.outboundMessage.update({
          where: { id: outboundMessageId },
          data: {
            status: 'PENDING_APPROVAL',
            approvalId: approvalResult.approvalId || null,
            lastError: null
          }
        })

        await writeAuditLogStrict({
          ticketId,
          traceId: msgTraceId,
          actor,
          action: 'OUTBOUND_SEND_REQUESTED',
          tool: provider,
          templateId,
          outboundMessageId,
          approvalId: approvalResult.approvalId || undefined,
          request: approvalPayload,
          response: { needsApproval: true, approvalId: approvalResult.approvalId }
        })

        return {
          status: 'pending_approval',
          approvalId: approvalResult.approvalId,
          message: '外发消息需要审批后发送'
        }
      }

      await writeAuditLogStrict({
        ticketId,
        traceId: msgTraceId,
        actor,
        action: 'OUTBOUND_SEND_REQUESTED',
        tool: provider,
        approvalId: existingApprovalId,
        templateId,
        outboundMessageId,
        request: approvalPayload,
        response: { needsApproval: false, dispatched: true }
      })

      return {
        status: 'sent',
        result: approvalResult.result
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)

      if (message) {
        // 确保失败状态落盘（dispatch 内部 catch 可能提前退出）
        try {
          await prisma.outboundMessage.update({
            where: { id: message.id },
            data: {
              status: 'FAILED',
              lastError: errMsg
            }
          })
        } catch {
          // 状态更新失败，审计日志继续记录
        }

        try {
          await writeAuditLogStrict({
            ticketId: message.ticketId || undefined,
            traceId: message.traceId,
            actor,
            action: 'OUTBOUND_SEND_REQUESTED',
            tool: message.provider,
            approvalId: message.approvalId || undefined,
            templateId: message.templateId || undefined,
            outboundMessageId: message.id,
            request: {
              outboundMessageId: message.id,
              traceId: message.traceId,
              channel: message.channel,
              to: maskTarget(message.to)
            },
            response: { success: false, error: errMsg }
          })
        } catch (logError) {
          const logMsg = logError instanceof Error ? logError.message : String(logError)
          fastify.log.error({ traceId: message.traceId, err: logMsg }, '写入审计日志失败：OUTBOUND_SEND_REQUESTED')
        }
      }

      throw new Error(`发送外发消息失败：${errMsg}`)
    }
  })

  // 重试发送外发消息
  fastify.post('/api/outbound-messages/:id/retry', async (request) => {
    const { id } = request.params as { id: string }
    const message = await prisma.outboundMessage.findUnique({ where: { id } })

    if (!message) {
      throw new Error('外发消息不存在')
    }

    if (message.status !== 'FAILED') {
      return { status: 'skipped', message: '仅 FAILED 状态允许重试' }
    }

    if (message.approvalId) {
      const approval = await prisma.approval.findUnique({ where: { id: message.approvalId } })
      if (!approval || approval.status !== 'APPROVED') {
        return { status: 'blocked', message: '外发重试需要有效审批（APPROVED）' }
      }
    } else {
      return { status: 'blocked', message: '未关联审批，禁止直接重试' }
    }

    if (message.nextRetryAt && message.nextRetryAt.getTime() > Date.now()) {
      return { status: 'deferred', message: '仍在退避窗口内', nextRetryAt: message.nextRetryAt.toISOString() }
    }

    try {
      const result = await dispatchOutboundMessage(message.id, 'admin')
      return { status: 'sent', result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: { status: 'FAILED', lastError: errorMessage }
      })
      return { status: 'failed', message: errorMessage }
    }
  })

  // 批量重试待发送消息
  fastify.post('/api/outbound-messages/retry-due', async () => {
    const traceId = uuidv4()
    const actor = 'system'

    try {
      const now = new Date()
      const dueMessages = await prisma.outboundMessage.findMany({
        where: {
          status: 'FAILED',
          attempts: { lt: MAX_RETRY_ATTEMPTS },
          OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null }]
        },
        orderBy: { nextRetryAt: 'asc' }
      })

      const results: Array<{ id: string; success: boolean; error?: string }> = []
      let successCount = 0

      for (const msg of dueMessages) {
        try {
          await dispatchOutboundMessage(msg.id, actor)
          results.push({ id: msg.id, success: true })
          successCount += 1
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          results.push({ id: msg.id, success: false, error: errMsg })
        }
      }

      await writeAuditLogStrict({
        traceId,
        actor,
        action: 'OUTBOUND_BATCH_RETRY',
        tool: 'outbound-messages',
        request: {
          now: now.toISOString(),
          criteria: {
            status: 'FAILED',
            attemptsLt: MAX_RETRY_ATTEMPTS,
            nextRetryAtDueOrNull: true
          }
        },
        response: {
          total: dueMessages.length,
          successCount,
          failureCount: dueMessages.length - successCount
        }
      })

      return {
        retriedCount: successCount,
        results
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      try {
        await writeAuditLogStrict({
          traceId,
          actor,
          action: 'OUTBOUND_BATCH_RETRY',
          tool: 'outbound-messages',
          request: { reason: 'exception' },
          response: { success: false, error: errMsg }
        })
      } catch (logError) {
        const logMsg = logError instanceof Error ? logError.message : String(logError)
        fastify.log.error({ traceId, err: logMsg }, '写入审计日志失败：OUTBOUND_BATCH_RETRY')
      }
      throw new Error(`批量重试外发消息失败：${errMsg}`)
    }
  })
}
