/**
 * Alerts 路由模块 - 告警管理
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  emitApiEvent,
  isWorkspaceTemporarilyUnlocked
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface UpdateAlertBody {
  status: 'ACKED' | 'RESOLVED'
}

// ==================== 路由注册 ====================

export function registerAlertsRoutes(fastify: FastifyInstance): void {
  // 获取告警列表
  fastify.get('/api/alerts', async (request, reply) => {
    const { workspaceId, targetId, status, severity } = request.query as {
      workspaceId?: string
      targetId?: string
      status?: string
      severity?: string
    }

    try {
      const rows = await prisma.alert.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(targetId ? { targetId } : {}),
          ...(status ? { status } : {}),
          ...(severity ? { severity } : {})
        },
        orderBy: { updatedAt: 'desc' }
      })
      return ok(rows)
    } catch (error) {
      reply.code(500)
      return fail(`获取 Alerts 失败：${toErrorMessage(error)}`)
    }
  })

  // 获取告警详情
  fastify.get('/api/alerts/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const row = await prisma.alert.findUnique({ where: { id } })
      if (!row) {
        reply.code(404)
        return fail('Alert 不存在')
      }
      return ok(row)
    } catch (error) {
      reply.code(500)
      return fail(`获取 Alert 详情失败：${toErrorMessage(error)}`)
    }
  })

  // 更新告警状态
  fastify.post('/api/alerts/:id/status', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
    const body = request.body as UpdateAlertBody

    try {
      const existing = await prisma.alert.findUnique({ where: { id } })
      if (!existing) {
        reply.code(404)
        return fail('Alert 不存在')
      }

      const updated = await prisma.alert.update({
        where: { id },
        data: { status: body.status, traceId }
      })

      await writeAuditLog({
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'ALERT_STATUS_UPDATED',
        tool: 'doctor-alerts',
        request: { alertId: id, status: body.status },
        response: { alertId: updated.id }
      })

      await emitApiEvent({
        workspaceId: existing.workspaceId,
        targetId: existing.targetId || undefined,
        sourceType: 'DOCTOR',
        sourceId: updated.id,
        eventType: body.status === 'ACKED' ? 'ALERT_ACKED' : 'ALERT_RESOLVED',
        severity: body.status === 'ACKED' ? 'WARN' : 'INFO',
        title: body.status === 'ACKED' ? 'Alert 已确认' : 'Alert 已解决',
        summary: updated.title,
        payload: {
          alertId: updated.id,
          status: updated.status
        },
        traceId
      })

      return ok(updated)
    } catch (error) {
      reply.code(500)
      return fail(`更新 Alert 状态失败：${toErrorMessage(error)}`)
    }
  })

  // 从 Alert 创建修复 Operation
  fastify.post('/api/alerts/:id/create-operation', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }

    try {
      const alert = await prisma.alert.findUnique({ where: { id } })
      if (!alert) {
        reply.code(404)
        return fail('Alert 不存在')
      }

      const workspace = await prisma.workspace.findUnique({ where: { id: alert.workspaceId } })
      if (!workspace) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
      if (workspace.isReadOnlyDefault && !unlocked) {
        reply.code(403)
        return fail('PROD Workspace 未解锁，不能生成修复 Operation')
      }

      const operation = await prisma.operation.create({
        data: {
          workspaceId: alert.workspaceId,
          targetId: alert.targetId || null,
          type: 'DOCTOR_FIX',
          status: 'PENDING',
          traceId,
          title: `修复 Alert：${alert.title}`,
          summary: alert.summary,
          phases: {
            create: [
              {
                name: 'Diagnose',
                orderNo: 1,
                status: 'PENDING',
                steps: {
                  create: [
                    {
                      name: 'Review alert context',
                      stepType: 'PRECHECK',
                      status: 'PENDING',
                      requestJson: JSON.stringify({ alertId: alert.id, severity: alert.severity })
                    }
                  ]
                }
              },
              {
                name: 'Apply Fix',
                orderNo: 2,
                status: 'PENDING',
                steps: {
                  create: [
                    {
                      name: 'Apply corrective action',
                      stepType: 'CUSTOM',
                      status: 'PENDING',
                      requestJson: JSON.stringify({ alertId: alert.id })
                    }
                  ]
                }
              },
              {
                name: 'Verify',
                orderNo: 3,
                status: 'PENDING',
                steps: {
                  create: [
                    {
                      name: 'Run verification',
                      stepType: 'VERIFY',
                      status: 'PENDING',
                      requestJson: JSON.stringify({ alertId: alert.id })
                    }
                  ]
                }
              }
            ]
          }
        },
        include: {
          phases: {
            include: { steps: true },
            orderBy: { orderNo: 'asc' }
          }
        }
      })

      await writeAuditLog({
        workspaceId: alert.workspaceId,
        traceId,
        actor,
        action: 'ALERT_OPERATION_CREATED',
        tool: 'doctor-alerts',
        request: { alertId: alert.id },
        response: { operationId: operation.id }
      })

      await emitApiEvent({
        workspaceId: alert.workspaceId,
        targetId: alert.targetId || undefined,
        sourceType: 'DOCTOR',
        sourceId: operation.id,
        eventType: 'ALERT_OPERATION_CREATED',
        severity: 'WARN',
        title: '已从 Alert 生成修复 Operation',
        summary: alert.title,
        payload: {
          alertId: alert.id,
          operationId: operation.id
        },
        traceId
      })

      return ok(operation)
    } catch (error) {
      reply.code(500)
      return fail(`从 Alert 创建 Operation 失败：${toErrorMessage(error)}`)
    }
  })
}
