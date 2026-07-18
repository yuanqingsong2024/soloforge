/**
 * Doctor 路由模块 - 诊断检查
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { DoctorService } from '../doctor-service'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  emitApiEvent
} from '../api-shared'

// ==================== 类型定义 ====================

interface DoctorRunBody {
  workspaceId: string
  createdBy: string
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

function diagnosticSeverityToAlertStatus(severity: string): 'OK' | 'WARN' | 'ERROR' | 'CRITICAL' {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL'
    case 'ERROR':
      return 'ERROR'
    case 'WARNING':
      return 'WARN'
    default:
      return 'OK'
  }
}

function doctorCategoryLabel(category: string): string {
  const categoryMap: Record<string, string> = {
    WS_CONNECTION: 'WS 连接',
    AUTH: '认证',
    CONFIG_DRIFT: '配置漂移',
    HOOKS: 'Hooks',
    TRUSTED_PROXIES: '受信代理',
    BACKUP: '备份',
    MIGRATION_STATE: '迁移状态',
    DEPLOYMENT_HEALTH: '部署健康',
    HOST_AGENT: '宿主机 Agent',
    OUTBOX: 'Outbox',
    APPROVAL_BACKLOG: '审批积压'
  }

  return categoryMap[category] || category
}

function doctorAlertTitle(category: string): string {
  return `医生告警 · ${doctorCategoryLabel(category)}`
}

async function createOrUpdateAlert(input: {
  workspaceId: string
  targetId?: string | null
  sourceCheckId: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  title: string
  summary: string
  dedupeKey: string
  traceId?: string
}): Promise<{ alertId: string; created: boolean }> {
  const existing = await prisma.alert.findFirst({
    where: {
      workspaceId: input.workspaceId,
      dedupeKey: input.dedupeKey,
      status: { in: ['OPEN', 'ACKED'] }
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (existing) {
    const updated = await prisma.alert.update({
      where: { id: existing.id },
      data: {
        severity: input.severity,
        summary: input.summary,
        title: input.title,
        traceId: input.traceId || existing.traceId,
        sourceCheckId: input.sourceCheckId,
        targetId: input.targetId || existing.targetId
      }
    })
    return { alertId: updated.id, created: false }
  }

  const created = await prisma.alert.create({
    data: {
      workspaceId: input.workspaceId,
      targetId: input.targetId || null,
      sourceCheckId: input.sourceCheckId,
      severity: input.severity,
      status: 'OPEN',
      title: input.title,
      summary: input.summary,
      dedupeKey: input.dedupeKey,
      traceId: input.traceId || null
    }
  })

  return { alertId: created.id, created: true }
}

// ==================== 路由注册 ====================

export function registerDoctorRoutes(fastify: FastifyInstance): void {
  // 运行诊断
  fastify.post('/api/doctor/run', async (request, reply) => {
    const traceId = uuidv4()
    const body = request.body as DoctorRunBody
    try {
      const workspaceId = (body.workspaceId || '').trim()
      const createdBy = (body.createdBy || '').trim()
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!createdBy) {
        reply.code(400)
        return fail('createdBy 不能为空')
      }

      const report = await DoctorService.runFullDiagnostic(workspaceId, createdBy)

      for (const finding of report.findings) {
        const check = await prisma.doctorCheck.create({
          data: {
            workspaceId,
            checkType: finding.category,
            status: diagnosticSeverityToAlertStatus(finding.severity),
            resultJson: JSON.stringify(finding),
            score: finding.severity === 'OK' ? 100 : finding.severity === 'WARNING' ? 70 : finding.severity === 'ERROR' ? 40 : 10,
            traceId
          }
        })

        if (finding.severity !== 'OK') {
          const dedupeKey = `${workspaceId}:${finding.category}:${finding.message}`
          const alertResult = await createOrUpdateAlert({
            workspaceId,
            sourceCheckId: check.id,
            severity: diagnosticSeverityToEventSeverity(finding.severity),
            title: doctorAlertTitle(finding.category),
            summary: finding.message,
            dedupeKey,
            traceId
          })

          await emitApiEvent({
            workspaceId,
            sourceType: 'DOCTOR',
            sourceId: alertResult.alertId,
            eventType: 'DOCTOR_ALERT_RAISED',
            severity: diagnosticSeverityToEventSeverity(finding.severity),
            title: doctorAlertTitle(finding.category),
            summary: finding.message,
            payload: {
              alertId: alertResult.alertId,
              sourceCheckId: check.id,
              recommendation: finding.recommendation,
              dedupeKey,
              created: alertResult.created
            },
            traceId
          })
        }
      }

      await emitApiEvent({
        workspaceId,
        sourceType: 'DOCTOR',
        sourceId: report.id,
        eventType: 'DOCTOR_REPORT_COMPLETED',
        severity: report.severity === 'CRITICAL' ? 'CRITICAL' : report.severity === 'ERROR' ? 'ERROR' : report.severity === 'WARNING' ? 'WARN' : 'INFO',
        title: 'Doctor 巡检已完成',
        summary: report.summary,
        payload: report,
        traceId
      })

      return ok(report)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '运行诊断失败')
      reply.code(500)
      return fail(`运行诊断失败：${errMsg}`)
    }
  })

  // 获取诊断检查项
  fastify.get('/api/doctor/checks', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId } = request.query as { workspaceId?: string }

    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const rows = await prisma.doctorCheck.findMany({
        where: { workspaceId: wid },
        orderBy: { createdAt: 'desc' },
        take: 100
      })

      const checks = rows.map(row => ({
        id: row.checkType,
        name: doctorCategoryLabel(row.checkType),
        category: row.checkType,
        description: row.resultJson,
        severity: row.status === 'CRITICAL' ? 'CRITICAL' : row.status === 'ERROR' ? 'HIGH' : row.status === 'WARN' ? 'MEDIUM' : 'INFO',
        enabled: true,
        lastRunAt: row.createdAt.toISOString(),
        score: row.score
      }))

      return ok(checks)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取诊断检查项失败')
      reply.code(500)
      return fail(`获取诊断检查项失败：${errMsg}`)
    }
  })

  // 执行单项诊断
  fastify.post('/api/doctor/run/:checkId', async (request, reply) => {
    const traceId = uuidv4()
    const { checkId } = request.params as { checkId: string }
    const body = request.body as Partial<DoctorRunBody>

    try {
      const workspaceId = (body.workspaceId || '').trim()
      const createdBy = (body.createdBy || 'admin').trim() || 'admin'
      const id = (checkId || '').trim()

      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!id) {
        reply.code(400)
        return fail('checkId 不能为空')
      }

      const report = await DoctorService.runDiagnostics(workspaceId, createdBy, [id])
      return ok(report)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '执行单项诊断失败')
      reply.code(500)
      return fail(`执行单项诊断失败：${errMsg}`)
    }
  })

  // 获取诊断报告历史
  fastify.get('/api/doctor/reports', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId, limit } = request.query as { workspaceId?: string; limit?: string }
    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const parsedLimit = limit === undefined || limit === '' ? undefined : Number(limit)
      if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        reply.code(400)
        return fail('limit 必须是正整数')
      }

      const rows = await DoctorService.getReportHistory(wid, parsedLimit ?? 20)
      return ok(rows)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取诊断历史失败')
      reply.code(500)
      return fail(`获取诊断历史失败：${errMsg}`)
    }
  })

  // 获取诊断报告详情
  fastify.get('/api/doctor/reports/:id', async (request, reply) => {
    const traceId = uuidv4()
    const { id } = request.params as { id: string }
    try {
      const reportId = (id || '').trim()
      if (!reportId) {
        reply.code(400)
        return fail('id 不能为空')
      }

      const report = await DoctorService.getReport(reportId)
      if (!report) {
        reply.code(404)
        return fail('诊断报告不存在')
      }

      return ok(report)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取诊断报告详情失败')
      reply.code(500)
      return fail(`获取诊断报告详情失败：${errMsg}`)
    }
  })
}
