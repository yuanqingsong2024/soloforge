/**
 * 数据导入/导出服务
 * 
 * 提供标准化的 JSON 格式数据交换能力
 * 支持导出/导入：工单、联系人、角色、Agent、配置等
 * 
 * 设计约束：
 * - 使用标准 JSON 格式，便于第三方工具集成
 * - 敏感信息（token/password）不导出或脱敏
 * - 导入时支持冲突处理策略
 * - 所有操作写入审计日志
 */

import { prisma } from './db'
import { writeAuditLog } from './audit-log-writer'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// 类型定义
// ============================================

/** 导出数据格式版本 */
const EXPORT_VERSION = '1.0'

/** 导出数据类型 */
export type ExportDataType = 
  | 'tickets'
  | 'contacts'
  | 'roles'
  | 'agents'
  | 'tools'
  | 'templates'
  | 'commsProfiles'
  | 'commsTargets'
  | 'notificationPolicies'
  | 'all'

/** 导入冲突处理策略 */
export type ConflictStrategy = 'skip' | 'overwrite' | 'create-new'

/** 导出数据元信息 */
export interface ExportMetadata {
  version: string
  exportedAt: string
  workspaceId: string
  workspaceName: string
  exportedBy: string
  dataTypes: ExportDataType[]
}

/** 导出数据包结构 */
export interface ExportPackage {
  metadata: ExportMetadata
  data: {
    tickets?: unknown[]
    contacts?: unknown[]
    roles?: unknown[]
    agents?: unknown[]
    tools?: unknown[]
    templates?: unknown[]
    commsProfiles?: unknown[]
    commsTargets?: unknown[]
    notificationPolicies?: unknown[]
  }
}

/** 导入结果 */
export interface ImportResult {
  success: boolean
  imported: Record<string, number>
  skipped: Record<string, number>
  errors: Array<{ type: string; message: string; item?: string }>
}

/** 导入选项 */
export interface ImportOptions {
  conflictStrategy: ConflictStrategy
  dataTypes: ExportDataType[]
  workspaceId?: string
}

// ============================================
// 辅助函数
// ============================================

/** 脱敏敏感字段 */
function maskSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'password', 'secret', 'apiKey', 'api_key', 'authToken']
  const masked = { ...obj }
  
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      const value = masked[key]
      if (typeof value === 'string' && value.length > 4) {
        masked[key] = value.slice(0, 2) + '****' + value.slice(-2)
      } else {
        masked[key] = '****'
      }
    }
    if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key] as Record<string, unknown>)
    }
  }
  
  return masked
}

/** 移除系统生成的字段 */
function removeSystemFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const systemFields = ['id', 'createdAt', 'updatedAt', 'traceId']
  const result = { ...obj }
  for (const field of systemFields) {
    delete result[field]
  }
  return result
}

// ============================================
// 导出功能
// ============================================

/**
 * 导出数据
 */
export async function exportData(
  workspaceId: string,
  dataTypes: ExportDataType[],
  exportedBy: string = 'system'
): Promise<ExportPackage> {
  const traceId = uuidv4()
  
  // 获取工作区信息
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  })
  
  if (!workspace) {
    throw new Error(`工作区不存在: ${workspaceId}`)
  }

  const data: ExportPackage['data'] = {}
  
  // 导出工单
  if (dataTypes.includes('tickets') || dataTypes.includes('all')) {
    const tickets = await prisma.ticket.findMany({
      where: { workspaceId },
      include: {
        contact: true,
        assignee: true,
        tags: { include: { tag: true } }
      }
    })
    data.tickets = tickets.map(t => removeSystemFields(maskSensitiveData(t as unknown as Record<string, unknown>)))
  }
  
  // 导出联系人
  if (dataTypes.includes('contacts') || dataTypes.includes('all')) {
    const contacts = await prisma.contact.findMany({
      where: { workspaceId }
    })
    data.contacts = contacts.map(c => removeSystemFields(maskSensitiveData(c as unknown as Record<string, unknown>)))
  }
  
  // 导出角色
  if (dataTypes.includes('roles') || dataTypes.includes('all')) {
    const roles = await prisma.role.findMany({
      include: { agents: true }
    })
    data.roles = roles.map(r => removeSystemFields(maskSensitiveData(r as unknown as Record<string, unknown>)))
  }
  
  // 导出 Agent
  if (dataTypes.includes('agents') || dataTypes.includes('all')) {
    const agents = await prisma.agent.findMany({
      include: {
        role: true,
        tools: { include: { tool: true } }
      }
    })
    data.agents = agents.map(a => removeSystemFields(maskSensitiveData(a as unknown as Record<string, unknown>)))
  }
  
  // 导出工具
  if (dataTypes.includes('tools') || dataTypes.includes('all')) {
    const tools = await prisma.tool.findMany()
    data.tools = tools.map(t => removeSystemFields(maskSensitiveData(t as unknown as Record<string, unknown>)))
  }
  
  // 导出消息模板
  if (dataTypes.includes('templates') || dataTypes.includes('all')) {
    const templates = await prisma.messageTemplate.findMany()
    data.templates = templates.map(t => removeSystemFields(maskSensitiveData(t as unknown as Record<string, unknown>)))
  }
  
  // 导出通讯配置
  if (dataTypes.includes('commsProfiles') || dataTypes.includes('all')) {
    const profiles = await prisma.commsProfile.findMany({
      include: { targets: true }
    })
    data.commsProfiles = profiles.map(p => removeSystemFields(maskSensitiveData(p as unknown as Record<string, unknown>)))
  }
  
  // 导出通知策略
  if (dataTypes.includes('notificationPolicies') || dataTypes.includes('all')) {
    const policies = await prisma.notificationPolicy.findMany({
      where: { workspaceId }
    })
    data.notificationPolicies = policies.map(p => removeSystemFields(maskSensitiveData(p as unknown as Record<string, unknown>)))
  }

  const pkg: ExportPackage = {
    metadata: {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      workspaceId,
      workspaceName: workspace.name,
      exportedBy,
      dataTypes
    },
    data
  }

  // 写入审计日志
  await writeAuditLog({
    traceId,
    actor: exportedBy,
    action: 'DATA_EXPORTED',
    tool: 'import-export',
    workspaceId,
    request: { dataTypes, workspaceId },
    response: { 
      recordCounts: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      )
    }
  })

  return pkg
}

/**
 * 导出为 JSON 字符串
 */
export async function exportToJson(
  workspaceId: string,
  dataTypes: ExportDataType[],
  exportedBy: string = 'system'
): Promise<string> {
  const pkg = await exportData(workspaceId, dataTypes, exportedBy)
  return JSON.stringify(pkg, null, 2)
}

// ============================================
// 导入功能
// ============================================

/**
 * 导入数据
 */
export async function importData(
  pkg: ExportPackage,
  options: ImportOptions
): Promise<ImportResult> {
  const traceId = uuidv4()
  const result: ImportResult = {
    success: true,
    imported: {},
    skipped: {},
    errors: []
  }
  
  const targetWorkspaceId = options.workspaceId || pkg.metadata.workspaceId
  
  // 验证版本兼容性
  if (pkg.metadata.version !== EXPORT_VERSION) {
    result.errors.push({
      type: 'version',
      message: `数据格式版本不兼容: ${pkg.metadata.version} != ${EXPORT_VERSION}`
    })
    result.success = false
    return result
  }

  try {
    // 导入工单
    if (pkg.data.tickets && (options.dataTypes.includes('tickets') || options.dataTypes.includes('all'))) {
      const count = await importTickets(pkg.data.tickets as Record<string, unknown>[], targetWorkspaceId, options.conflictStrategy, result)
      result.imported.tickets = count
    }
    
    // 导入联系人
    if (pkg.data.contacts && (options.dataTypes.includes('contacts') || options.dataTypes.includes('all'))) {
      const count = await importContacts(pkg.data.contacts as Record<string, unknown>[], targetWorkspaceId, options.conflictStrategy, result)
      result.imported.contacts = count
    }
    
    // 导入消息模板
    if (pkg.data.templates && (options.dataTypes.includes('templates') || options.dataTypes.includes('all'))) {
      const count = await importTemplates(pkg.data.templates as Record<string, unknown>[], targetWorkspaceId, options.conflictStrategy, result)
      result.imported.templates = count
    }
    
    // 导入通知策略
    if (pkg.data.notificationPolicies && (options.dataTypes.includes('notificationPolicies') || options.dataTypes.includes('all'))) {
      const count = await importNotificationPolicies(pkg.data.notificationPolicies as Record<string, unknown>[], targetWorkspaceId, options.conflictStrategy, result)
      result.imported.notificationPolicies = count
    }

    // 写入审计日志
    await writeAuditLog({
      traceId,
      actor: 'user',
      action: 'DATA_IMPORTED',
      tool: 'import-export',
      workspaceId: targetWorkspaceId,
      request: { 
        sourceWorkspace: pkg.metadata.workspaceId, 
        dataTypes: options.dataTypes,
        conflictStrategy: options.conflictStrategy 
      },
      response: { result }
    })
  } catch (error) {
    result.errors.push({
      type: 'import',
      message: (error as Error).message
    })
    result.success = false
  }

  return result
}

/** 导入工单 */
async function importTickets(
  tickets: Record<string, unknown>[],
  workspaceId: string,
  strategy: ConflictStrategy,
  result: ImportResult
): Promise<number> {
  let imported = 0
  
  for (const ticket of tickets) {
    try {
      const title = ticket.title as string
      const existing = await prisma.ticket.findFirst({
        where: { workspaceId, title }
      })
      
      if (existing) {
        result.skipped.tickets = (result.skipped.tickets || 0) + 1
        if (strategy === 'overwrite') {
          await prisma.ticket.update({
            where: { id: existing.id },
            data: {
              source: ticket.source as string,
              status: ticket.status as string,
              priority: ticket.priority as string,
              customerMeta: ticket.customerMeta as string
            }
          })
          imported++
        } else if (strategy === 'create-new') {
          await prisma.ticket.create({
            data: {
              workspaceId,
              title: `${title} (导入副本)`,
              source: ticket.source as string,
              status: 'INBOX',
              priority: ticket.priority as string || 'MEDIUM',
              customerMeta: ticket.customerMeta as string || '{}'
            }
          })
          imported++
        }
      } else {
        await prisma.ticket.create({
          data: {
            workspaceId,
            title,
            source: ticket.source as string,
            status: ticket.status as string || 'INBOX',
            priority: ticket.priority as string || 'MEDIUM',
            customerMeta: ticket.customerMeta as string || '{}'
          }
        })
        imported++
      }
    } catch (error) {
      result.errors.push({
        type: 'ticket',
        message: (error as Error).message,
        item: ticket.title as string
      })
    }
  }
  
  return imported
}

/** 导入联系人 */
async function importContacts(
  contacts: Record<string, unknown>[],
  workspaceId: string,
  strategy: ConflictStrategy,
  result: ImportResult
): Promise<number> {
  let imported = 0
  
  for (const contact of contacts) {
    try {
      const name = contact.name as string
      const existing = await prisma.contact.findFirst({
        where: { workspaceId, name }
      })
      
      if (existing) {
        result.skipped.contacts = (result.skipped.contacts || 0) + 1
        if (strategy === 'overwrite') {
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name,
              company: contact.company as string | null,
              tags: contact.tags as string || '[]',
              notes: contact.notes as string || ''
            }
          })
          imported++
        } else if (strategy === 'create-new') {
          await prisma.contact.create({
            data: {
              workspaceId,
              name: `${name} (导入副本)`,
              company: contact.company as string | null,
              tags: contact.tags as string || '[]',
              notes: contact.notes as string || ''
            }
          })
          imported++
        }
      } else {
        await prisma.contact.create({
          data: {
            workspaceId,
            name,
            company: contact.company as string | null,
            tags: contact.tags as string || '[]',
            notes: contact.notes as string || ''
          }
        })
        imported++
      }
    } catch (error) {
      result.errors.push({
        type: 'contact',
        message: (error as Error).message,
        item: contact.name as string
      })
    }
  }
  
  return imported
}

/** 导入消息模板 */
async function importTemplates(
  templates: Record<string, unknown>[],
  _workspaceId: string,
  strategy: ConflictStrategy,
  result: ImportResult
): Promise<number> {
  let imported = 0
  
  for (const template of templates) {
    try {
      const name = template.name as string
      const existing = await prisma.messageTemplate.findUnique({
        where: { name }
      })
      
      if (existing) {
        result.skipped.templates = (result.skipped.templates || 0) + 1
        if (strategy === 'overwrite') {
          await prisma.messageTemplate.update({
            where: { id: existing.id },
            data: {
              scenario: template.scenario as string || 'CUSTOM',
              channelConstraints: template.channelConstraints as string || '[]',
              contentFormat: template.contentFormat as string || 'MARKDOWN',
              subjectTemplate: template.subjectTemplate as string | null,
              bodyTemplate: template.bodyTemplate as string,
              variablesSchema: template.variablesSchema as string || '{}',
              defaults: template.defaults as string || '{}'
            }
          })
          imported++
        } else if (strategy === 'create-new') {
          await prisma.messageTemplate.create({
            data: {
              name: `${name}_import_${Date.now()}`,
              scenario: template.scenario as string || 'CUSTOM',
              channelConstraints: template.channelConstraints as string || '[]',
              contentFormat: template.contentFormat as string || 'MARKDOWN',
              subjectTemplate: template.subjectTemplate as string | null,
              bodyTemplate: template.bodyTemplate as string,
              variablesSchema: template.variablesSchema as string || '{}',
              defaults: template.defaults as string || '{}'
            }
          })
          imported++
        }
      } else {
        await prisma.messageTemplate.create({
          data: {
            name,
            scenario: template.scenario as string || 'CUSTOM',
            channelConstraints: template.channelConstraints as string || '[]',
            contentFormat: template.contentFormat as string || 'MARKDOWN',
            subjectTemplate: template.subjectTemplate as string | null,
            bodyTemplate: template.bodyTemplate as string,
            variablesSchema: template.variablesSchema as string || '{}',
            defaults: template.defaults as string || '{}'
          }
        })
        imported++
      }
    } catch (error) {
      result.errors.push({
        type: 'template',
        message: (error as Error).message,
        item: template.name as string
      })
    }
  }
  
  return imported
}

/** 导入通知策略 */
async function importNotificationPolicies(
  policies: Record<string, unknown>[],
  workspaceId: string,
  strategy: ConflictStrategy,
  result: ImportResult
): Promise<number> {
  let imported = 0
  
  for (const policy of policies) {
    try {
      const name = policy.name as string
      const existing = await prisma.notificationPolicy.findFirst({
        where: { workspaceId, name }
      })
      
      if (existing) {
        result.skipped.notificationPolicies = (result.skipped.notificationPolicies || 0) + 1
        if (strategy === 'overwrite') {
          await prisma.notificationPolicy.update({
            where: { id: existing.id },
            data: {
              eventFilters: policy.eventFilters as string,
              targetFilters: policy.targetFilters as string,
              deliveryTargets: policy.deliveryTargets as string,
              cooldownSeconds: policy.cooldownSeconds as number
            }
          })
          imported++
        } else if (strategy === 'create-new') {
          await prisma.notificationPolicy.create({
            data: {
              workspaceId,
              name: `${name} (导入副本)`,
              eventFilters: policy.eventFilters as string,
              targetFilters: policy.targetFilters as string,
              deliveryTargets: policy.deliveryTargets as string,
              cooldownSeconds: policy.cooldownSeconds as number
            }
          })
          imported++
        }
      } else {
        await prisma.notificationPolicy.create({
          data: {
            workspaceId,
            name,
            eventFilters: policy.eventFilters as string,
            targetFilters: policy.targetFilters as string,
            deliveryTargets: policy.deliveryTargets as string,
            cooldownSeconds: policy.cooldownSeconds as number
          }
        })
        imported++
      }
    } catch (error) {
      result.errors.push({
        type: 'notificationPolicy',
        message: (error as Error).message,
        item: policy.name as string
      })
    }
  }
  
  return imported
}

/**
 * 从 JSON 字符串导入数据
 */
export async function importFromJson(
  jsonString: string,
  options: ImportOptions
): Promise<ImportResult> {
  try {
    const pkg = JSON.parse(jsonString) as ExportPackage
    return await importData(pkg, options)
  } catch (error) {
    return {
      success: false,
      imported: {},
      skipped: {},
      errors: [{
        type: 'parse',
        message: `JSON 解析失败: ${(error as Error).message}`
      }]
    }
  }
}
