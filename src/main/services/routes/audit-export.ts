/**
 * 审计日志导出 API 路由
 * 
 * 提供审计日志导出和报表生成功能
 */

import { FastifyInstance } from 'fastify'
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
  filter: QueryRequest
  includeHashChain?: boolean
  masked?: boolean
}

interface ReportRequest {
  workspaceId: string
  startDate: string
  endDate: string
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
  fastify.post<{ Body: ExportRequest }>(`${prefix}/export/json`, async (request) => {
    const { format, filter, includeHashChain, masked } = request.body
    
    if (format !== 'json') {
      return {
        success: false,
        error: '格式不匹配，请使用 format: json'
      }
    }

    const jsonContent = await exportAuditLogsToJson({
      format: 'json',
      filter: {
        workspaceId: filter.workspaceId,
        startDate: filter.startDate ? new Date(filter.startDate) : undefined,
        endDate: filter.endDate ? new Date(filter.endDate) : undefined,
        actor: filter.actor,
        action: filter.action,
        tool: filter.tool,
        limit: filter.limit || 10000
      },
      includeHashChain: includeHashChain ?? false,
      masked: masked ?? true
    })

    return {
      success: true,
      contentType: 'application/json',
      filename: `audit-logs-${new Date().toISOString().split('T')[0]}.json`,
      data: JSON.parse(jsonContent)
    }
  })

  // 导出为 CSV
  fastify.post<{ Body: ExportRequest }>(`${prefix}/export/csv`, async (request) => {
    const { format, filter, includeHashChain } = request.body
    
    if (format !== 'csv') {
      return {
        success: false,
        error: '格式不匹配，请使用 format: csv'
      }
    }

    const csvContent = await exportAuditLogsToCsv({
      format: 'csv',
      filter: {
        workspaceId: filter.workspaceId,
        startDate: filter.startDate ? new Date(filter.startDate) : undefined,
        endDate: filter.endDate ? new Date(filter.endDate) : undefined,
        actor: filter.actor,
        action: filter.action,
        tool: filter.tool,
        limit: filter.limit || 10000
      },
      includeHashChain: includeHashChain ?? false,
      masked: false
    })

    return {
      success: true,
      contentType: 'text/csv',
      filename: `audit-logs-${new Date().toISOString().split('T')[0]}.csv`,
      data: csvContent
    }
  })

  // 生成完整报表
  fastify.post<{ Body: ReportRequest }>(`${prefix}/report`, async (request) => {
    const { workspaceId, startDate, endDate } = request.body
    
    const report = await generateAuditReport(
      workspaceId,
      new Date(startDate),
      new Date(endDate)
    )
    
    return {
      success: true,
      data: report
    }
  })

  // 生成 CSV 报表
  fastify.post<{ Body: ReportRequest }>(`${prefix}/report/csv`, async (request) => {
    const { workspaceId, startDate, endDate } = request.body
    
    const csvContent = await generateAuditReportCsv(
      workspaceId,
      new Date(startDate),
      new Date(endDate)
    )
    
    return {
      success: true,
      contentType: 'text/csv',
      filename: `audit-report-${new Date().toISOString().split('T')[0]}.csv`,
      data: csvContent
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
