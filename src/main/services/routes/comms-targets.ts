/**
 * Comms Targets 路由模块 - 通讯目标管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalGuard } from '../approval-guard'
import {
  prisma
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface CreateCommsTargetBody {
  commsProfileId: string
  channel: string
  to: string
  displayName: string
  allowlisted?: boolean
  notes?: string
}

interface UpdateCommsTargetBody {
  channel?: string
  to?: string
  displayName?: string
  allowlisted?: boolean
  notes?: string | null
}

// ==================== JSON Schema 定义 ====================

const createCommsTargetBodySchema = {
  body: {
    type: 'object',
    required: ['commsProfileId', 'channel', 'to', 'displayName'],
    additionalProperties: false,
    properties: {
      commsProfileId: { type: 'string' },
      channel: { type: 'string' },
      to: { type: 'string' },
      displayName: { type: 'string' },
      allowlisted: { type: 'boolean' },
      notes: { type: 'string' }
    }
  }
}

// ==================== 路由注册 ====================

export function registerCommsTargetsRoutes(fastify: FastifyInstance): void {
  // 获取通讯目标列表
  fastify.get('/api/comms/targets', async (request) => {
    const { commsProfileId, allowlisted } = request.query as { commsProfileId?: string; allowlisted?: string }
    return await prisma.commsTarget.findMany({
      where: {
        ...(commsProfileId ? { commsProfileId } : {}),
        ...(allowlisted !== undefined ? { allowlisted: allowlisted === 'true' } : {})
      },
      include: { commsProfile: true },
      orderBy: { createdAt: 'desc' }
    })
  })

  // 创建通讯目标
  fastify.post('/api/comms/targets', { schema: createCommsTargetBodySchema }, async (request) => {
    const { commsProfileId, channel, to, displayName, allowlisted, notes } = request.body as CreateCommsTargetBody
    const requestedBy = 'admin'

    const createdTarget = await prisma.commsTarget.create({
      data: {
        commsProfileId,
        channel,
        to,
        displayName,
        allowlisted: false,
        notes: notes || null
      }
    })

    if (!allowlisted) {
      return { status: 'success', target: createdTarget }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_CONFIG',
      {
        kind: 'ALLOWLIST_TARGET',
        targetId: createdTarget.id,
        channel: createdTarget.channel,
        to: createdTarget.to
      },
      requestedBy,
      async () => {
        await prisma.commsTarget.update({
          where: { id: createdTarget.id },
          data: { allowlisted: true }
        })

        const traceId = uuidv4()
        await writeAuditLog({
          traceId,
          actor: requestedBy,
          action: 'ALLOWLIST_TARGET',
          tool: 'communications',
          request: { targetId: createdTarget.id, channel: createdTarget.channel, to: createdTarget.to },
          response: { allowlisted: true }
        })

        return { allowlisted: true }
      }
    )

    if (approvalResult.needsApproval) {
      return {
        status: 'pending_approval',
        approvalId: approvalResult.approvalId,
        message: '目标创建成功，加入 allowlist 需要审批',
        target: createdTarget
      }
    }

    const updatedTarget = await prisma.commsTarget.findUnique({ where: { id: createdTarget.id } })
    return { status: 'success', target: updatedTarget }
  })

  // 更新通讯目标
  fastify.put('/api/comms/targets/:id', async (request) => {
    const { id } = request.params as { id: string }
    const { channel, to, displayName, allowlisted, notes } = request.body as UpdateCommsTargetBody
    return await prisma.commsTarget.update({
      where: { id },
      data: {
        ...(channel !== undefined ? { channel } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(allowlisted !== undefined ? { allowlisted } : {}),
        ...(notes !== undefined ? { notes } : {})
      }
    })
  })

  // 删除通讯目标
  fastify.delete('/api/comms/targets/:id', async (request) => {
    const { id } = request.params as { id: string }
    return await prisma.commsTarget.delete({ where: { id } })
  })

  // 请求加入 allowlist
  fastify.post('/api/comms/targets/:id/request-allowlist', async (request) => {
    const { id } = request.params as { id: string }
    const target = await prisma.commsTarget.findUnique({ where: { id } })
    if (!target) {
      throw new Error('通讯目标不存在')
    }

    if (target.allowlisted) {
      return { status: 'already_allowlisted', message: '该目标已在 allowlist 中' }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_CONFIG',
      {
        kind: 'ALLOWLIST_TARGET',
        targetId: target.id,
        channel: target.channel,
        to: target.to
      },
      'admin',
      async () => {
        await prisma.commsTarget.update({
          where: { id: target.id },
          data: { allowlisted: true }
        })

        const traceId = uuidv4()
        await writeAuditLog({
          traceId,
          actor: 'admin',
          action: 'ALLOWLIST_TARGET',
          tool: 'communications',
          request: { targetId: target.id, channel: target.channel, to: target.to },
          response: { allowlisted: true }
        })

        return { allowlisted: true }
      }
    )

    if (approvalResult.needsApproval) {
      return {
        status: 'pending_approval',
        approvalId: approvalResult.approvalId,
        message: '加入 allowlist 需要审批'
      }
    }

    return { status: 'success', result: approvalResult.result }
  })
}
