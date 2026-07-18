/**
 * Contacts 路由模块 - 联系人管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import {
  prisma,
  safeParseJson,
  maskTarget
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface UpdateContactBody {
  name?: string
  company?: string
  tags?: string[]
  notes?: string
}

interface BindContactTargetBody {
  commsTargetId: string
  isPrimary?: boolean
}

// ==================== JSON Schema 定义 ====================

const createContactBodySchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      company: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' }
    }
  }
}

// ==================== 路由注册 ====================

export function registerContactsRoutes(fastify: FastifyInstance): void {
  // 获取联系人列表
  fastify.get('/api/contacts', async () => {
    const traceId = uuidv4()
    try {
      const contacts = await prisma.contact.findMany({
        include: {
          contactTargets: {
            include: {
              commsTarget: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      const result = contacts.map(contact => ({
        ...contact,
        tags: safeParseJson<string[]>(contact.tags, [])
      }))

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_LIST',
        tool: 'contacts',
        request: {},
        response: { count: result.length }
      })

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`获取联系人列表失败：${message}`)
    }
  })

  // 创建联系人
  fastify.post('/api/contacts', { schema: createContactBodySchema }, async (request) => {
    const traceId = uuidv4()
    try {
      const body = request.body as {
        name: string
        company?: string
        tags?: string[]
        notes?: string
      }
      if (!body.name || !body.name.trim()) {
        throw new Error('联系人姓名不能为空')
      }

      const created = await prisma.contact.create({
        data: {
          name: body.name.trim(),
          company: body.company || null,
          tags: JSON.stringify(body.tags || []),
          notes: body.notes || ''
        }
      })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_CREATE',
        tool: 'contacts',
        request: {
          name: created.name,
          company: created.company,
          tagsCount: (body.tags || []).length
        },
        response: { contactId: created.id }
      })

      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`创建联系人失败：${message}`)
    }
  })

  // 更新联系人
  fastify.put('/api/contacts/:id', async (request) => {
    const traceId = uuidv4()
    try {
      const { id } = request.params as { id: string }
      const body = request.body as UpdateContactBody

      const existing = await prisma.contact.findUnique({ where: { id } })
      if (!existing) {
        throw new Error('联系人不存在')
      }

      const updated = await prisma.contact.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.company !== undefined ? { company: body.company || null } : {}),
          ...(body.tags !== undefined ? { tags: JSON.stringify(body.tags || []) } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {})
        }
      })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_UPDATE',
        tool: 'contacts',
        request: {
          contactId: id,
          patch: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.company !== undefined ? { company: body.company || null } : {}),
            ...(body.tags !== undefined ? { tags: body.tags || [] } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {})
          }
        },
        response: { contactId: updated.id }
      })

      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`更新联系人失败：${message}`)
    }
  })

  // 删除联系人
  fastify.delete('/api/contacts/:id', async (request) => {
    const traceId = uuidv4()
    try {
      const { id } = request.params as { id: string }
      const existing = await prisma.contact.findUnique({ where: { id } })
      if (!existing) {
        throw new Error('联系人不存在')
      }

      const deleted = await prisma.contact.delete({ where: { id } })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_DELETE',
        tool: 'contacts',
        request: { contactId: id },
        response: { contactId: deleted.id }
      })

      return deleted
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`删除联系人失败：${message}`)
    }
  })

  // 绑定联系人目标
  fastify.post('/api/contacts/:contactId/targets', async (request) => {
    const traceId = uuidv4()
    try {
      const { contactId } = request.params as { contactId: string }
      const body = request.body as BindContactTargetBody

      if (!body.commsTargetId) {
        throw new Error('commsTargetId 不能为空')
      }

      const commsTarget = await prisma.commsTarget.findUnique({ where: { id: body.commsTargetId } })
      if (!commsTarget) {
        throw new Error('通讯目标不存在')
      }

      const isPrimary = body.isPrimary ?? false
      const toMasked = maskTarget(commsTarget.to)

      const created = await prisma.$transaction(async (tx) => {
        if (isPrimary) {
          await tx.contactTarget.updateMany({ where: { contactId }, data: { isPrimary: false } })
        }

        return await tx.contactTarget.create({
          data: {
            contactId,
            commsTargetId: commsTarget.id,
            isPrimary,
            channel: commsTarget.channel,
            toMasked,
            displayName: commsTarget.displayName
          }
        })
      })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_BIND',
        tool: 'contacts',
        request: {
          contactId,
          commsTargetId: commsTarget.id,
          isPrimary,
          channel: commsTarget.channel,
          to: toMasked,
          displayName: commsTarget.displayName
        },
        response: { contactTargetId: created.id }
      })

      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`绑定联系人目标失败：${message}`)
    }
  })

  // 获取联系人目标列表
  fastify.get('/api/contacts/:contactId/targets', async (request) => {
    const traceId = uuidv4()
    try {
      const { contactId } = request.params as { contactId: string }

      const rows = await prisma.contactTarget.findMany({
        where: { contactId },
        include: { commsTarget: true }
      })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_LIST',
        tool: 'contacts',
        request: { contactId },
        response: { count: rows.length }
      })

      return rows
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`获取联系人目标列表失败：${message}`)
    }
  })

  // 解绑联系人目标
  fastify.delete('/api/contacts/:contactId/targets/:targetId', async (request) => {
    const traceId = uuidv4()
    try {
      const { contactId, targetId } = request.params as { contactId: string; targetId: string }

      await prisma.contactTarget.delete({ where: { id: targetId } })

      await writeAuditLog({
        traceId,
        actor: 'admin',
        action: 'CONTACT_TARGET_UNBIND',
        tool: 'contacts',
        request: { contactId, targetId },
        response: { success: true }
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`解绑联系人目标失败：${message}`)
    }
  })

  // 关联工单与联系人
  fastify.put('/api/tickets/:id/contact', async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as { contactId?: string | null; primaryTargetId?: string | null }

    let primaryTargetId = body.primaryTargetId ?? null
    if (!primaryTargetId && body.contactId) {
      const primaryBinding = await prisma.contactTarget.findFirst({
        where: { contactId: body.contactId, isPrimary: true },
        include: { commsTarget: true }
      })
      primaryTargetId = primaryBinding?.commsTargetId || null
    }

    return await prisma.ticket.update({
      where: { id },
      data: {
        contactId: body.contactId || null,
        primaryTargetId
      },
      include: {
        contact: true,
        primaryTarget: true,
        assignee: true,
        artifacts: true,
        approvals: true,
        tags: { include: { tag: true } }
      }
    })
  })
}
