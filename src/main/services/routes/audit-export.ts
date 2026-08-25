/**
 * 审计日志导出 API 路由
 * 
 * 提供审计日志导出和报表生成功能
 */

import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalGuard } from '../approval-guard'
import { writeAuditLogStrict } from '../audit-log-writer'
import {
  queryAuditLogs,
  getAuditLogStatistics,
  exportAuditLogsToJson,
  exportAuditLogsToCsv,
  generateAuditReport,
  generateAuditReportCsv,
  verifyHashChain,
  AuditLogFilter
} from '../audit-log-export'

// ============================================
// 请求类型
// ============================================

interface QueryRequest {
  workspaceId?: string
  startDate?: string
  endDate?: string
  actor?: string
  action?: string
  tool?: string
  ticketId?: string
  approvalId?: string
  traceId?: string
  limit?: number
  offset?: number
}

interface ExportRequest {
  format: 'json' | 'csv'
  approvalId: string
  filter: QueryRequest
  includeHashChain?: boolean
  masked?: boolean
  traceId?: string
}

function validateExportFilter(filter: QueryRequest | undefined): AuditLogFilter {
  if (!filter) throw new Error('导出 filter 不能为空')
  const limit = filter.limit ?? 10000
  const offset = filter.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('limit 必须是 1 到 10000 的整数')
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset 必须是非负整数')
  const startDate = filter.startDate ? new Date(filter.startDate) : undefined
  const endDate = filter.endDate ? new Date(filter.endDate) : undefined
  if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
    throw new Error('日期格式无效')
  }
  if (startDate && endDate && startDate > endDate) throw new Error('startDate 不能晚于 endDate')
  return {
    workspaceId: filter.workspaceId,
    startDate,
    endDate,
    actor: filter.actor,
    action: filter.action,
    tool: filter.tool,
    ticketId: filter.ticketId,
    approvalId: filter.approvalId,
    traceId: filter.traceId,
    limit,
    offset
  }
}

interface ReportRequest {
  workspaceId: string
  startDate: string
  endDate: string
  approvalId: string
  traceId?: string
}

interface VerifyHashRequest {
  workspaceId: string
  startDate?: string
  endDate?: string
}

// ============================================
// 路由注册
// ============================================

export function registerAuditExportRoutes(fastify: FastifyInstance): void {
  const prefix = '/api/audit-export'
  const authorizeExport = async (approvalId: string) => {
    if (!approvalId) throw new Error('approvalId 不能为空')
    return await ApprovalGuard.getInstance().assertApproved(approvalId, 'EXPORT_DATA')
  }

  const auditExport = async (input: { traceId: string; approvalId: string; format: string; workspaceId?: string; totalRecords: number; status: string; error?: string }) => {
    await writeAuditLogStrict({
      workspaceId: input.workspaceId,
      traceId: input.traceId,
      actor: 'admin',
      action: input.status === 'success' ? 'EXPORT_DATA' : 'EXPORT_DATA_FAILED',
      tool: 'audit-export',
      approvalId: input.approvalId,
      request: { format: input.format, workspaceId: input.workspaceId },
      response: { status: input.status, totalRecords: input.totalRecords, error: input.error }
    })
  }

  // 查询审计日志
  fastify.post<{ Body: QueryRequest }>(`${prefix}/query`, async (request) => {
    const filter: AuditLogFilter = {
      workspaceId: request.body.workspaceId,
      startDate: request.body.startDate ? new Date(request.body.startDate) : undefined,
      endDate: request.body.endDate ? new Date(request.body.endDate) : undefined,
      actor: request.body.actor,
      action: request.body.action,
      tool: request.body.tool,
      ticketId: request.body.ticketId,
      approvalId: request.body.approvalId,
      traceId: request.body.traceId,
      limit: request.body.limit || 1000,
      offset: request.body.offset || 0
    }

    const logs = await queryAuditLogs(filter)
    return {
      success: true,
      data: logs,
      total: logs.length
    }
  })

  // 获取统计信息
  fastify.post<{ Body: { workspaceId: string; startDate: string; endDate: string } }>(
    `${prefix}/statistics`,
    async (request) => {
      const { workspaceId, startDate, endDate } = request.body
      
      const stats = await getAuditLogStatistics(
        workspaceId,
        new Date(startDate),
        new Date(endDate)
      )
      
      return {
        success: true,
        data: stats
      }
    }
  )

  // 导出为 JSON
  fastify.post<{ Body: ExportRequest }>(`${prefix}/export/json`, async (request, reply) => {
    const { format, filter, includeHashChain, approvalId, traceId = uuidv4() } = request.body
    if (format !== 'json') {
      reply.code(400)
      return { success: false, error: '格式不匹配，请使用 format: json' }
    }
    try {
      await authorizeExport(approvalId)
      const normalizedFilter = validateExportFilter(filter)
      const jsonContent = await exportAuditLogsToJson({ format: 'json', filter: normalizedFilter, includeHashChain: includeHashChain ?? false, masked: true })
      const data = JSON.parse(jsonContent) as { totalRecords: number; workspaceId?: string }
      await auditExport({ traceId, approvalId, format, workspaceId: normalizedFilter.workspaceId, totalRecords: data.totalRecords, status: 'success' })
      return { success: true, contentType: 'application/json', filename: `audit-logs-${new Date().toISOString().split('T')[0]}.json`, data }
    } catch (error) {
      await auditExport({ traceId, approvalId, format, workspaceId: filter?.workspaceId, totalRecords: 0, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      reply.code(403)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 导出为 CSV
  fastify.post<{ Body: ExportRequest }>(`${prefix}/export/csv`, async (request, reply) => {
    const { format, filter, includeHashChain, approvalId, traceId = uuidv4() } = request.body
    if (format !== 'csv') {
      reply.code(400)
      return { success: false, error: '格式不匹配，请使用 format: csv' }
    }
    try {
      await authorizeExport(approvalId)
      const normalizedFilter = validateExportFilter(filter)
      const csvContent = await exportAuditLogsToCsv({ format: 'csv', filter: normalizedFilter, includeHashChain: includeHashChain ?? false, masked: true })
      const totalRecords = Math.max(0, csvContent.split('\n').length - 1)
      await auditExport({ traceId, approvalId, format, workspaceId: normalizedFilter.workspaceId, totalRecords, status: 'success' })
      return { success: true, contentType: 'text/csv', filename: `audit-logs-${new Date().toISOString().split('T')[0]}.csv`, data: csvContent }
    } catch (error) {
      await auditExport({ traceId, approvalId, format, workspaceId: filter?.workspaceId, totalRecords: 0, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      reply.code(403)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 生成完整报表
  fastify.post<{ Body: ReportRequest }>(`${prefix}/report`, async (request, reply) => {
    const { workspaceId, startDate, endDate, approvalId, traceId = uuidv4() } = request.body
    try {
      await authorizeExport(approvalId)
      const report = await generateAuditReport(workspaceId, new Date(startDate), new Date(endDate))
      await auditExport({ traceId, approvalId, format: 'report-json', workspaceId, totalRecords: report.summary?.totalOperations || 0, status: 'success' })
      return { success: true, data: report }
    } catch (error) {
      await auditExport({ traceId, approvalId, format: 'report-json', workspaceId, totalRecords: 0, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      reply.code(403)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 生成 CSV 报表
  fastify.post<{ Body: ReportRequest }>(`${prefix}/report/csv`, async (request, reply) => {
    const { workspaceId, startDate, endDate, approvalId, traceId = uuidv4() } = request.body
    try {
      await authorizeExport(approvalId)
      const csvContent = await generateAuditReportCsv(workspaceId, new Date(startDate), new Date(endDate))
      await auditExport({ traceId, approvalId, format: 'report-csv', workspaceId, totalRecords: Math.max(0, csvContent.split('\n').length - 1), status: 'success' })
      return { success: true, contentType: 'text/csv', filename: `audit-report-${new Date().toISOString().split('T')[0]}.csv`, data: csvContent }
    } catch (error) {
      await auditExport({ traceId, approvalId, format: 'report-csv', workspaceId, totalRecords: 0, status: 'failed', error: error instanceof Error ? error.message : String(error) })
      reply.code(403)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 验证哈希链
  fastify.post<{ Body: VerifyHashRequest }>(`${prefix}/verify-hash`, async (request) => {
    const { workspaceId, startDate, endDate } = request.body
    
    const result = await verifyHashChain(
      workspaceId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )
    
    return {
      success: true,
      data: result
    }
  })

  // 获取可用操作类型列表
  fastify.get(`${prefix}/action-types`, async () => {
    // 从数据库中获取所有唯一的操作类型
    const { prisma } = await import('../api-shared')
    
    const actions = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action']
    })
    
    return {
      success: true,
      data: actions.map(a => a.action)
    }
  })

  // 获取可用工具列表
  fastify.get(`${prefix}/tools`, async () => {
    const { prisma } = await import('../api-shared')
    
    const tools = await prisma.auditLog.findMany({
      select: { tool: true },
      distinct: ['tool']
    })
    
    return {
      success: true,
      data: tools.map(t => t.tool).filter(Boolean)
    }
  })

  // 获取操作用户列表
  fastify.get(`${prefix}/actors`, async (request) => {
    const { prisma } = await import('../api-shared')
    
    const workspaceId = (request.query as { workspaceId?: string }).workspaceId
    
    const where = workspaceId ? { workspaceId } : {}
    
    const actors = await prisma.auditLog.findMany({
      where,
      select: { actor: true },
      distinct: ['actor']
    })
    
    return {
      success: true,
      data: actors.map(a => a.actor)
    }
  })
}
