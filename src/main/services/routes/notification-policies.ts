/**
 * Notification Policy 路由模块 - 通知策略管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { NotificationPolicyService } from '../notification-policy-service'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  safeParseJson,
  triggerNotificationPolicies,
  emitApiEvent
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface CreateNotificationPolicyBody {
  workspaceId: string
  name: string
  enabled?: boolean
  eventFilters?: Record<string, unknown>
  targetFilters?: Record<string, unknown>
  deliveryTargets: string[]
  templateId?: string | null
  cooldownSeconds?: number
  dedupeWindowSeconds?: number
  quietHours?: { start: string; end: string } | null
}

// ==================== 路由注册 ====================

export function registerNotificationPolicyRoutes(fastify: FastifyInstance): void {
  // 获取通知策略列表
  fastify.get('/api/notification-policies', async (request, reply) => {
    const { workspaceId, enabled } = request.query as { workspaceId?: string; enabled?: string }

    try {
      const rows = await NotificationPolicyService.list({
        workspaceId,
        enabled: enabled === undefined ? undefined : enabled === 'true'
      })

      return ok(rows.map((row: typeof rows[number]) => ({
        ...row,
        eventFilters: safeParseJson(row.eventFilters, {}),
        targetFilters: safeParseJson(row.targetFilters, {}),
        deliveryTargets: safeParseJson(row.deliveryTargets, []),
        quietHours: safeParseJson(row.quietHoursJson, null)
      })))
    } catch (error) {
      reply.code(500)
      return fail(`获取通知策略失败：${toErrorMessage(error)}`)
    }
  })

  // 创建通知策略
  fastify.post('/api/notification-policies', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const body = request.body as CreateNotificationPolicyBody

    try {
      if (!body.workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!body.name) {
        reply.code(400)
        return fail('name 不能为空')
      }
      if (!Array.isArray(body.deliveryTargets) || body.deliveryTargets.length === 0) {
        reply.code(400)
        return fail('deliveryTargets 不能为空')
      }

      const created = await prisma.notificationPolicy.create({
        data: {
          workspaceId: body.workspaceId,
          name: body.name,
          enabled: body.enabled ?? true,
          eventFilters: JSON.stringify(body.eventFilters || {}),
          targetFilters: JSON.stringify(body.targetFilters || {}),
          deliveryTargets: JSON.stringify(body.deliveryTargets),
          templateId: body.templateId || null,
          cooldownSeconds: body.cooldownSeconds ?? 300,
          dedupeWindowSeconds: body.dedupeWindowSeconds ?? 900,
          quietHoursJson: body.quietHours ? JSON.stringify(body.quietHours) : null
        }
      })

      await writeAuditLog({
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'NOTIFICATION_POLICY_CREATED',
        tool: 'notification-policies',
        request: {
          workspaceId: body.workspaceId,
          name: body.name,
          enabled: body.enabled ?? true
          },
        response: { policyId: created.id }
      })

      await emitApiEvent({
        workspaceId: body.workspaceId,
        sourceType: 'SYSTEM',
        sourceId: created.id,
        eventType: 'NOTIFICATION_POLICY_CREATED',
        severity: 'INFO',
        title: '通知策略已创建',
        summary: body.name,
        payload: { policyId: created.id },
        traceId
      })

      return ok(created)
    } catch (error) {
      reply.code(500)
      return fail(`创建通知策略失败：${toErrorMessage(error)}`)
    }
  })

  // 更新通知策略
  fastify.put('/api/notification-policies/:id', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
    const body = request.body as Partial<CreateNotificationPolicyBody>

    try {
      const existing = await prisma.notificationPolicy.findUnique({ where: { id } })
      if (!existing) {
        reply.code(404)
        return fail('通知策略不存在')
      }

      const updated = await prisma.notificationPolicy.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.eventFilters !== undefined ? { eventFilters: JSON.stringify(body.eventFilters) } : {}),
          ...(body.targetFilters !== undefined ? { targetFilters: JSON.stringify(body.targetFilters) } : {}),
          ...(body.deliveryTargets !== undefined ? { deliveryTargets: JSON.stringify(body.deliveryTargets) } : {}),
          ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
          ...(body.cooldownSeconds !== undefined ? { cooldownSeconds: body.cooldownSeconds } : {}),
          ...(body.dedupeWindowSeconds !== undefined ? { dedupeWindowSeconds: body.dedupeWindowSeconds } : {}),
          ...(body.quietHours !== undefined ? { quietHoursJson: body.quietHours ? JSON.stringify(body.quietHours) : null } : {})
        }
      })

      await writeAuditLog({
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'NOTIFICATION_POLICY_UPDATED',
        tool: 'notification-policies',
        request: { policyId: id },
        response: { policyId: updated.id }
      })

      return ok(updated)
    } catch (error) {
      reply.code(500)
      return fail(`更新通知策略失败：${toErrorMessage(error)}`)
    }
  })

  // 测试通知策略
  fastify.post('/api/notification-policies/:id/test', async (request, reply) => {
    const traceId = uuidv4()
    const { id } = request.params as { id: string }

    try {
      const policy = await prisma.notificationPolicy.findUnique({ where: { id } })
      if (!policy) {
        reply.code(404)
        return fail('通知策略不存在')
      }

      await triggerNotificationPolicies({
        workspaceId: policy.workspaceId,
        sourceType: 'SYSTEM',
        eventType: 'NOTIFICATION_POLICY_TEST',
        severity: 'INFO',
        title: '通知策略测试事件',
        summary: `策略 ${policy.name} 手动测试`,
        traceId,
        payload: { policyId: policy.id, manual: true }
      })

      return ok({ traceId, message: '已触发策略测试，请到 OutboundMessage/审批中心查看结果' })
    } catch (error) {
      reply.code(500)
      return fail(`测试通知策略失败：${toErrorMessage(error)}`)
    }
  })
}
