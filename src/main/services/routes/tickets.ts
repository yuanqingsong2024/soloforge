/**
 * 工单 / 标签 / 交付物 路由模块
 *
 * 路由清单：
 * - GET    /api/tickets              获取工单列表
 * - GET    /api/tickets/:id          获取工单详情
 * - POST   /api/tickets              创建工单（JSON Schema 校验）
 * - PUT    /api/tickets/:id          更新工单（JSON Schema 校验）
 * - GET    /api/tags                 获取标签列表
 * - POST   /api/tags                 创建标签
 * - PUT    /api/tags/:id             更新标签
 * - DELETE /api/tags/:id             删除标签
 * - GET    /api/tickets/:id/tags     获取工单标签
 * - POST   /api/tickets/:id/tags     关联工单标签
 * - DELETE /api/tickets/:id/tags/:tagId  取消关联工单标签
 * - POST   /api/artifacts            创建交付物（JSON Schema 校验）
 */

import { type FastifyInstance } from 'fastify'
import { prisma, ok, fail } from '../api-shared'

// ==================== JSON Schema 定义 ====================

const createTicketBodySchema = {
  body: {
    type: 'object',
    required: ['title'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1 },
      source: { type: 'string' },
      status: { type: 'string' },
      priority: { type: 'string' },
      customerMeta: { type: 'string' },
      assigneeAgentId: { type: 'string' },
      contactId: { type: 'string' },
      primaryTargetId: { type: 'string' },
      dueAt: { type: 'string' }
    }
  }
}

const updateTicketBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      status: { type: 'string' },
      priority: { type: 'string' },
      customerMeta: { type: 'string' },
      assigneeAgentId: { type: 'string' },
      contactId: { type: 'string' },
      primaryTargetId: { type: 'string' },
      dueAt: { type: 'string' }
    }
  }
}

const createArtifactBodySchema = {
  body: {
    type: 'object',
    required: ['ticketId', 'type', 'content'],
    additionalProperties: false,
    properties: {
      ticketId: { type: 'string' },
      type: { type: 'string', enum: ['PRD', 'PLAN', 'CODE_CHANGE', 'TEST_CASES', 'DEPLOY', 'ROLLBACK', 'DELIVERY_LIST', 'CLIENT_MSG'] },
      content: { type: 'string' },
      version: { type: 'integer' }
    }
  }
}

// ==================== 路由注册 ====================

export function registerTicketRoutes(fastify: FastifyInstance): void {
  // ==================== Tickets ====================
  fastify.get('/api/tickets', async () => {
    return await prisma.ticket.findMany({
      include: {
        assignee: true,
        contact: true,
        primaryTarget: true,
        artifacts: true,
        approvals: true,
        tags: { include: { tag: true } }
      }
    })
  })

  fastify.get('/api/tickets/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        assignee: true,
        contact: true,
        primaryTarget: true,
        artifacts: true,
        approvals: true,
        tags: { include: { tag: true } }
      }
    })

    if (!ticket) {
      reply.code(404)
      return fail('工单不存在')
    }

    return ok(ticket)
  })

  fastify.post('/api/tickets', { schema: createTicketBodySchema }, async (request) => {
    const body = request.body as {
      title: string
      source?: string
      status?: string
      priority?: string
      customerMeta?: string
      assigneeAgentId?: string
      contactId?: string
      primaryTargetId?: string
      dueAt?: string
    }
    const data = {
      title: body.title || '未命名工单',
      source: body.source || 'manual',
      status: body.status || 'INBOX',
      priority: body.priority || 'MEDIUM',
      customerMeta: body.customerMeta || '{}',
      ...(body.assigneeAgentId ? { assigneeAgentId: body.assigneeAgentId } : {}),
      ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
      ...(body.primaryTargetId !== undefined ? { primaryTargetId: body.primaryTargetId } : {}),
      ...(body.dueAt ? { dueAt: new Date(body.dueAt) } : {})
    }
    return await prisma.ticket.create({
      data,
      include: { assignee: true, contact: true, primaryTarget: true, artifacts: true, approvals: true, tags: { include: { tag: true } } }
    })
  })

  fastify.put('/api/tickets/:id', { schema: updateTicketBodySchema }, async (request) => {
    const { id } = request.params as { id: string }
    const data = request.body as {
      title?: string
      status?: string
      priority?: string
      customerMeta?: string
      assigneeAgentId?: string
      contactId?: string
      primaryTargetId?: string
      dueAt?: string
    }
    return await prisma.ticket.update({
      where: { id },
      data: Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, k === 'dueAt' && typeof v === 'string' ? new Date(v) : v])
      ) as Record<string, unknown>,
      include: { assignee: true, contact: true, primaryTarget: true, artifacts: true, approvals: true, tags: { include: { tag: true } } }
    })
  })

  // ==================== Tags ====================
  fastify.get('/api/tags', async () => {
    return await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    })
  })
  fastify.post('/api/tags', async (request) => {
    const { name, color } = request.body as { name: string; color?: string }
    return await prisma.tag.create({
      data: { name, color: color || '#3B82F6' }
    })
  })
  fastify.put('/api/tags/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = request.body as { name?: string; color?: string }
    return await prisma.tag.update({ where: { id }, data })
  })
  fastify.delete('/api/tags/:id', async (request) => {
    const { id } = request.params as { id: string }
    return await prisma.tag.delete({ where: { id } })
  })
  // 工单标签关联
  fastify.get('/api/tickets/:id/tags', async (request) => {
    const { id } = request.params as { id: string }
    const ticketTags = await prisma.ticketTag.findMany({
      where: { ticketId: id },
      include: { tag: true }
    })
    return ticketTags.map(tt => tt.tag)
  })
  fastify.post('/api/tickets/:id/tags', async (request) => {
    const { id } = request.params as { id: string }
    const { tagId } = request.body as { tagId: string }
    return await prisma.ticketTag.create({
      data: { ticketId: id, tagId },
      include: { tag: true }
    })
  })
  fastify.delete('/api/tickets/:id/tags/:tagId', async (request) => {
    const { id, tagId } = request.params as { id: string; tagId: string }
    const ticketTag = await prisma.ticketTag.findFirst({
      where: { ticketId: id, tagId }
    })
    if (ticketTag) {
      await prisma.ticketTag.delete({ where: { id: ticketTag.id } })
    }
    return { success: true }
  })

  // ==================== Artifacts ====================
  fastify.post('/api/artifacts', { schema: createArtifactBodySchema }, async (request) => {
    const data = request.body as {
      ticketId: string
      type: string
      content: string
      version?: number
    }
    return await prisma.artifact.create({
      data: {
        ticketId: data.ticketId,
        type: data.type,
        content: data.content,
        ...(data.version !== undefined ? { version: data.version } : {})
      }
    })
  })
}
