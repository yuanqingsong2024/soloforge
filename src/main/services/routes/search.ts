/**
 * Search 路由模块 - 全局搜索
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import {
  prisma,
  ok,
  fail,
  toErrorMessage
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface GlobalSearchTicketResult {
  id: string
  title: string
  source: string
  status: string
  priority: string
}

interface GlobalSearchApprovalResult {
  id: string
  actionType: string
  status: string
  requestedBy: string
  ticketId: string | null
}

interface GlobalSearchAuditResult {
  id: string
  traceId: string
  actor: string
  action: string
  ts: string
}

interface GlobalSearchResponse {
  query: string
  tickets: GlobalSearchTicketResult[]
  approvals: GlobalSearchApprovalResult[]
  auditLogs: GlobalSearchAuditResult[]
}

// ==================== 路由注册 ====================

export function registerSearchRoutes(fastify: FastifyInstance): void {
  // 全局搜索
  fastify.get('/api/search', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { q, workspaceId } = request.query as { q?: string; workspaceId?: string }

    try {
      const query = (q || '').trim()
      if (!query) {
        reply.code(400)
        return fail('搜索关键词不能为空')
      }

      const scope = workspaceId ? { workspaceId } : {}

      const [tickets, approvals, auditLogs] = await Promise.all([
        prisma.ticket.findMany({
          where: {
            ...scope,
            OR: [
              { title: { contains: query } },
              { source: { contains: query } }
            ]
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            title: true,
            source: true,
            status: true,
            priority: true
          }
        }),
        prisma.approval.findMany({
          where: {
            ...(workspaceId
              ? {
                  ticket: {
                    workspaceId
                  }
                }
              : {}),
            OR: [
              { actionType: { contains: query } },
              { status: { contains: query } },
              { requestedBy: { contains: query } }
            ]
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            actionType: true,
            status: true,
            requestedBy: true,
            ticketId: true
          }
        }),
        prisma.auditLog.findMany({
          where: {
            ...scope,
            OR: [
              { traceId: { contains: query } },
              { actor: { contains: query } },
              { action: { contains: query } }
            ]
          },
          orderBy: { ts: 'desc' },
          take: 8,
          select: {
            id: true,
            traceId: true,
            actor: true,
            action: true,
            ts: true
          }
        })
      ])

      const result: GlobalSearchResponse = {
        query,
        tickets,
        approvals,
        auditLogs: auditLogs.map(item => ({
          ...item,
          ts: item.ts.toISOString()
        }))
      }

      await writeAuditLog({
        workspaceId: workspaceId || '00000000-0000-0000-0000-000000000001',
        traceId,
        actor,
        action: 'GLOBAL_SEARCH',
        tool: 'search',
        request: { query, workspaceId: workspaceId || null },
        response: {
          tickets: result.tickets.length,
          approvals: result.approvals.length,
          auditLogs: result.auditLogs.length
          }
      })

      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      reply.code(500)
      return fail(`搜索失败：${errMsg}`)
    }
  })
}
