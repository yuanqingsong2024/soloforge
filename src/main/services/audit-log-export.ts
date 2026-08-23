/**
 * 审计日志导出服务
 * 
 * 职责：
 * 1. 审计日志查询与过滤
 * 2. 导出功能（JSON、CSV 格式）
 * 3. 统计报表生成
 */

import { PrismaClient, AuditLog } from '@prisma/client'
import { maskSensitive } from './audit-log-writer'

const prisma = new PrismaClient()

// ============================================
// 类型定义
// ============================================

export interface AuditLogFilter {
  workspaceId?: string
  startDate?: Date
  endDate?: Date
  actor?: string
  action?: string
  tool?: string
  ticketId?: string
  approvalId?: string
  traceId?: string
  limit?: number
  offset?: number
}

export interface AuditLogExportOptions {
  format: 'json' | 'csv'
  filter: AuditLogFilter
  includeHashChain?: boolean // 包含哈希链验证信息
  masked?: boolean // 是否对敏感字段进行掩码处理
}

export interface AuditLogStatistics {
  totalCount: number
  byAction: Record<string, number>
  byActor: Record<string, number>
  byTool: Record<string, number>
  byDate: Record<string, number>
  highRiskActions: AuditLog[]
  recentActivity: AuditLog[]
}

export interface HashChainVerification {
  isValid: boolean
  brokenAt?: string
  totalRecords: number
  verifiedRecords: number
}

// ============================================
// 查询功能
// ============================================

/**
 * 查询审计日志
 */
export async function queryAuditLogs(filter: AuditLogFilter): Promise<AuditLog[]> {
  const where: Record<string, unknown> = {}
  
  if (filter.workspaceId) {
    where.workspaceId = filter.workspaceId
  }
  
  if (filter.startDate || filter.endDate) {
    where.ts = {}
    if (filter.startDate) {
      (where.ts as Record<string, Date>).gte = filter.startDate
    }
    if (filter.endDate) {
      (where.ts as Record<string, Date>).lte = filter.endDate
    }
  }
  
  if (filter.actor) {
    where.actor = { contains: filter.actor, mode: 'insensitive' }
  }
  
  if (filter.action) {
    where.action = filter.action
  }
  
  if (filter.tool) {
    where.tool = filter.tool
  }
  
  if (filter.ticketId) {
    where.ticketId = filter.ticketId
  }
  
  if (filter.approvalId) {
    where.approvalId = filter.approvalId
  }
  
  if (filter.traceId) {
    where.traceId = filter.traceId
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { ts: 'desc' },
    take: filter.limit || 1000,
    skip: filter.offset || 0
  })
}

/**
 * 获取审计日志统计信息
 */
export async function getAuditLogStatistics(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<AuditLogStatistics> {
  const logs = await queryAuditLogs({
    workspaceId,
    startDate,
    endDate,
    limit: 10000
  })

  const byAction: Record<string, number> = {}
  const byActor: Record<string, number> = {}
  const byTool: Record<string, number> = {}
  const byDate: Record<string, number> = {}

  const highRiskActions = new Set([
    'SEND_EXTERNAL',
    'MERGE_MAIN',
    'DEPLOY_PROD',
    'EXPORT_DATA',
    'PURCHASE',
    'CHANGE_CONFIG',
    'ROTATE_TOKEN'
  ])

  const highRiskLogs: AuditLog[] = []
  let recentCount = 0

  for (const log of logs) {
    // 统计操作类型
    byAction[log.action] = (byAction[log.action] || 0) + 1
    
    // 统计操作用户
    byActor[log.actor] = (byActor[log.actor] || 0) + 1
    
    // 统计涉及工具
    if (log.tool) {
      byTool[log.tool] = (byTool[log.tool] || 0) + 1
    }
    
    // 按日期统计
    const dateKey = log.ts.toISOString().split('T')[0]
    byDate[dateKey] = (byDate[dateKey] || 0) + 1
    
    // 高危操作
    if (highRiskActions.has(log.action)) {
      highRiskLogs.push(log)
    }
    
    // 最近 7 天活动
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    if (log.ts >= sevenDaysAgo) {
      recentCount++
    }
  }

  return {
    totalCount: logs.length,
    byAction,
    byActor,
    byTool,
    byDate,
    highRiskActions: highRiskLogs.slice(0, 50),
    recentActivity: logs.slice(0, 20)
  }
}

// ============================================
// 导出功能
// ============================================

/**
 * 解析 JSON 字符串字段
 */
function parseJsonField(jsonStr: string | null): Record<string, unknown> {
  if (!jsonStr) return {}
  try {
    return JSON.parse(jsonStr)
  } catch {
    return { raw: jsonStr }
  }
}

/**
 * 转换为可导出的格式
 */
function formatLogForExport(
  log: AuditLog,
  options: { masked?: boolean; includeHashChain?: boolean }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: log.id,
    traceId: log.traceId,
    actor: log.actor,
    action: log.action,
    tool: log.tool,
    timestamp: log.ts.toISOString(),
    workspaceId: log.workspaceId
  }

  if (log.ticketId) base.ticketId = log.ticketId
  if (log.approvalId) base.approvalId = log.approvalId
  if (log.templateId) base.templateId = log.templateId
  if (log.outboundMessageId) base.outboundMessageId = log.outboundMessageId
  if (log.changeRequestId) base.changeRequestId = log.changeRequestId
  if (log.snapshotId) base.snapshotId = log.snapshotId

  if (options.masked !== false) {
    base.request = maskSensitive(parseJsonField(log.request))
    base.response = maskSensitive(parseJsonField(log.response))
  } else {
    base.request = log.request
    base.response = log.response
  }

  if (options.includeHashChain) {
    base.previousHash = log.previousHash
    base.currentHash = log.currentHash
  }

  return base
}

/**
 * 导出为 JSON 格式
 */
export async function exportAuditLogsToJson(options: AuditLogExportOptions): Promise<string> {
  const logs = await queryAuditLogs(options.filter)
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    workspaceId: options.filter.workspaceId || 'all',
    totalRecords: logs.length,
    filter: {
      startDate: options.filter.startDate?.toISOString(),
      endDate: options.filter.endDate?.toISOString(),
      actor: options.filter.actor,
      action: options.filter.action,
      tool: options.filter.tool
    },
    data: logs.map(log => formatLogForExport(log, {
      masked: options.masked,
      includeHashChain: options.includeHashChain
    }))
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 导出为 CSV 格式
 */
export async function exportAuditLogsToCsv(options: AuditLogExportOptions): Promise<string> {
  const logs = await queryAuditLogs(options.filter)
  
  // CSV 表头
  const headers = [
    'ID',
    'Trace ID',
    '时间戳',
    '操作用户',
    '操作类型',
    '涉及工具',
    '工单ID',
    '审批ID',
    '操作详情',
    '响应结果'
  ]

  if (options.includeHashChain) {
    headers.push('前一条哈希', '当前哈希')
  }

  const rows: string[][] = []

  for (const log of logs) {
    const request = options.masked !== false
      ? maskSensitive(parseJsonField(log.request))
      : log.request
    const response = options.masked !== false
      ? maskSensitive(parseJsonField(log.response))
      : log.response

    const row: string[] = [
      log.id,
      log.traceId,
      log.ts.toISOString(),
      log.actor,
      log.action,
      log.tool || '',
      log.ticketId || '',
      log.approvalId || '',
      JSON.stringify(request),
      JSON.stringify(response)
    ]

    if (options.includeHashChain) {
      row.push(log.previousHash || '', log.currentHash)
    }

    rows.push(row)
  }

  // 转义 CSV 特殊字符
  const escapeCsv = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n')
}

/**
 * 验证哈希链完整性
 */
export async function verifyHashChain(
  workspaceId: string,
  startDate?: Date,
  endDate?: Date
): Promise<HashChainVerification> {
  const logs = await queryAuditLogs({
    workspaceId,
    startDate,
    endDate,
    limit: 10000
  })

  if (logs.length === 0) {
    return {
      isValid: true,
      totalRecords: 0,
      verifiedRecords: 0
    }
  }

  // 按时间排序
  logs.sort((a, b) => a.ts.getTime() - b.ts.getTime())

  let verifiedCount = 0
  let previousHash: string | null = null

  for (const log of logs) {
    if (log.previousHash !== previousHash) {
      return {
        isValid: false,
        brokenAt: log.id,
        totalRecords: logs.length,
        verifiedRecords: verifiedCount
      }
    }
    previousHash = log.currentHash
    verifiedCount++
  }

  return {
    isValid: true,
    totalRecords: logs.length,
    verifiedRecords: verifiedCount
  }
}

// ============================================
// 报表生成
// ============================================

export interface AuditReport {
  generatedAt: string
  period: {
    start: string
    end: string
  }
  workspaceId: string
  summary: {
    totalOperations: number
    uniqueActors: number
    uniqueActions: number
    highRiskOperations: number
  }
  statistics: AuditLogStatistics
  hashChainVerification: HashChainVerification
  topActors: Array<{ actor: string; count: number; percentage: number }>
  topActions: Array<{ action: string; count: number; percentage: number }>
  dailyActivity: Array<{ date: string; count: number }>
}

/**
 * 生成完整的审计报表
 */
export async function generateAuditReport(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<AuditReport> {
  // 获取统计数据
  const stats = await getAuditLogStatistics(workspaceId, startDate, endDate)
  
  // 验证哈希链
  const hashVerification = await verifyHashChain(workspaceId, startDate, endDate)
  
  // 计算 Top 用户
  const topActors = Object.entries(stats.byActor)
    .map(([actor, count]) => ({ actor, count, percentage: (count / stats.totalCount) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  // 计算 Top 操作
  const topActions = Object.entries(stats.byAction)
    .map(([action, count]) => ({ action, count, percentage: (count / stats.totalCount) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
  
  // 每日活动趋势
  const dailyActivity = Object.entries(stats.byDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
  
  // 高危操作统计
  const highRiskActions = new Set([
    'SEND_EXTERNAL',
    'MERGE_MAIN',
    'DEPLOY_PROD',
    'EXPORT_DATA',
    'PURCHASE',
    'CHANGE_CONFIG',
    'ROTATE_TOKEN'
  ])
  
  const highRiskCount = Object.keys(stats.byAction)
    .filter(action => highRiskActions.has(action))
    .reduce((sum, action) => sum + stats.byAction[action], 0)

  return {
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    workspaceId,
    summary: {
      totalOperations: stats.totalCount,
      uniqueActors: Object.keys(stats.byActor).length,
      uniqueActions: Object.keys(stats.byAction).length,
      highRiskOperations: highRiskCount
    },
    statistics: stats,
    hashChainVerification: hashVerification,
    topActors,
    topActions,
    dailyActivity
  }
}

/**
 * 生成 CSV 报表
 */
export async function generateAuditReportCsv(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const report = await generateAuditReport(workspaceId, startDate, endDate)
  
  const sections: string[] = []
  
  // 1. 摘要部分
  sections.push('=== 审计报表摘要 ===')
  sections.push(`生成时间,${report.generatedAt}`)
  sections.push(`报表周期,${report.period.start} 至 ${report.period.end}`)
  sections.push(`工作区ID,${report.workspaceId}`)
  sections.push('')
  
  // 2. 统计数据
  sections.push('=== 统计摘要 ===')
  sections.push(`总操作数,${report.summary.totalOperations}`)
  sections.push(`独立用户数,${report.summary.uniqueActors}`)
  sections.push(`操作类型数,${report.summary.uniqueActions}`)
  sections.push(`高危操作数,${report.summary.highRiskOperations}`)
  sections.push('')
  
  // 3. Top 用户
  sections.push('=== Top 10 用户 ===')
  sections.push('用户名,操作次数,占比')
  for (const actor of report.topActors) {
    sections.push(`${actor.actor},${actor.count},${actor.percentage.toFixed(2)}%`)
  }
  sections.push('')
  
  // 4. Top 操作
  sections.push('=== Top 20 操作类型 ===')
  sections.push('操作类型,次数,占比')
  for (const action of report.topActions) {
    sections.push(`${action.action},${action.count},${action.percentage.toFixed(2)}%`)
  }
  sections.push('')
  
  // 5. 每日活动
  sections.push('=== 每日活动趋势 ===')
  sections.push('日期,操作次数')
  for (const day of report.dailyActivity) {
    sections.push(`${day.date},${day.count}`)
  }
  sections.push('')
  
  // 6. 哈希链验证
  sections.push('=== 哈希链验证 ===')
  sections.push(`验证结果,${report.hashChainVerification.isValid ? '通过' : '失败'}`)
  sections.push(`验证记录数,${report.hashChainVerification.verifiedRecords}/${report.hashChainVerification.totalRecords}`)
  if (report.hashChainVerification.brokenAt) {
    sections.push(`断裂位置,${report.hashChainVerification.brokenAt}`)
  }
  
  return sections.join('\n')
}
