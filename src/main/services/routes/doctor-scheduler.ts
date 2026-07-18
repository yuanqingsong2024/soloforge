/**
 * Doctor Scheduler 路由模块 - 巡检调度
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { DoctorService } from '../doctor-service'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  safeParseJson,
  emitApiEvent
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface DoctorScheduleBody {
  workspaceId: string
  targetId?: string
  enabled?: boolean
  intervalMinutes?: number
  checkTypes?: string[]
}

// ==================== 辅助函数 ====================

function diagnosticSeverityToEventSeverity(severity: string): 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL'
    case 'ERROR':
      return 'ERROR'
    case 'WARNING':
      return 'WARN'
    default:
      return 'INFO'
  }
}

// ==================== 路由注册 ====================

export function registerDoctorSchedulerRoutes(fastify: FastifyInstance): void {
  // 获取巡检调度配置列表
  fastify.get('/api/doctor-schedules', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    try {
      const rows = await prisma.doctorSchedule.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {})
        },
        orderBy: { updatedAt: 'desc' }
      })
      return ok(rows.map(row => ({
        ...row,
        checkTypes: safeParseJson(row.checkTypesJson, [])
      })))
    } catch (error) {
      reply.code(500)
      return fail(`获取巡检调度配置失败：${toErrorMessage(error)}`)
    }
  })

  // 创建巡检调度配置
  fastify.post('/api/doctor-schedules', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const body = request.body as DoctorScheduleBody

    try {
      if (!body.workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const created = await prisma.doctorSchedule.create({
        data: {
          workspaceId: body.workspaceId,
          targetId: body.targetId || null,
          enabled: body.enabled ?? true,
          intervalMinutes: body.intervalMinutes ?? 30,
          checkTypesJson: JSON.stringify(body.checkTypes || ['GATEWAY_HEALTH', 'WS_CONNECTIVITY', 'AUTH_STATUS', 'TRUSTED_PROXIES', 'HOOKS'])
        }
      })

      await writeAuditLog({
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'DOCTOR_SCHEDULE_CREATED',
        tool: 'doctor-scheduler',
        request: { workspaceId: body.workspaceId, targetId: body.targetId || null },
        response: { scheduleId: created.id }
      })

      return ok(created)
    } catch (error) {
      reply.code(500)
      return fail(`创建巡检调度配置失败：${toErrorMessage(error)}`)
    }
  })

  // 手动执行巡检调度
  fastify.post('/api/doctor-schedules/:id/run-now', async (request, reply) => {
    const traceId = uuidv4()
    const { id } = request.params as { id: string }

    try {
      const schedule = await prisma.doctorSchedule.findUnique({ where: { id } })
      if (!schedule) {
        reply.code(404)
        return fail('巡检调度配置不存在')
      }

      const report = await DoctorService.runFullDiagnostic(schedule.workspaceId, 'manual-scheduler')
      await prisma.doctorSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: new Date() }
      })

      await emitApiEvent({
        workspaceId: schedule.workspaceId,
        targetId: schedule.targetId || undefined,
        sourceType: 'DOCTOR',
        sourceId: report.id,
        eventType: 'DOCTOR_SCHEDULE_MANUAL_RUN_COMPLETED',
        severity: diagnosticSeverityToEventSeverity(report.severity),
        title: '巡检调度手动执行完成',
        summary: report.summary,
        payload: {
          scheduleId: schedule.id,
          reportId: report.id
        },
        traceId
      })

      return ok({ scheduleId: schedule.id, report })
    } catch (error) {
      reply.code(500)
      return fail(`手动执行巡检失败：${toErrorMessage(error)}`)
    }
  })
}
