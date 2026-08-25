/**
 * 数据导入/导出 API 路由
 * 
 * 提供标准化的数据交换端点
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exportToJson, importFromJson, ExportDataType, ImportOptions } from '../import-export-service'
import { writeAuditLog } from '../audit-log-writer'
import { ApprovalGuard } from '../approval-guard'
import { TEST_WORKSPACE_ID } from '../api-shared'
import { v4 as uuidv4 } from 'uuid'

// ============================================
// Schema 验证
// ============================================

const exportQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  dataTypes: z.string().optional().default('all'),
  format: z.enum(['json']).default('json')
})

const importBodySchema = z.object({
  jsonData: z.string(),
  options: z.object({
    conflictStrategy: z.enum(['skip', 'overwrite', 'create-new']).default('skip'),
    dataTypes: z.array(z.string()).default(['all']),
    workspaceId: z.string().uuid().optional()
  })
})

// ============================================
// 注册路由
// ============================================

export async function registerImportExportRoutes(fastify: FastifyInstance): Promise<void> {
  
  // 导出数据（需审批）
  fastify.get('/api/export', async (request, reply) => {
    const query = exportQuerySchema.safeParse(request.query)
    if (!query.success) {
      reply.code(400)
      return { success: false, error: query.error.message }
    }

    const { workspaceId, dataTypes } = query.data
    const typesArray = (dataTypes || 'all').split(',') as ExportDataType[]
    const actor = 'user'
    const traceId = uuidv4()

    const approvalResult = await ApprovalGuard.executeProtected(
      'EXPORT_DATA',
      { dataTypes, workspaceId },
      actor,
      async () => {
        return await exportToJson(workspaceId, typesArray)
      }
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      return { success: true, status: 'pending_approval', approvalId: approvalResult.approvalId }
    }

    const jsonData = approvalResult.result as string

    await writeAuditLog({
      traceId,
      actor,
      action: 'DATA_EXPORT',
      tool: 'import-export',
      workspaceId,
      request: { dataTypes },
      response: { size: jsonData.length }
    })

    return {
      success: true,
      data: jsonData,
      contentType: 'application/json'
    }
  })

  // 导入数据（需审批）
  fastify.post('/api/import', async (request, reply) => {
    const body = importBodySchema.safeParse(request.body)
    if (!body.success) {
      reply.code(400)
      return { success: false, error: body.error.message }
    }

    const { jsonData, options } = body.data
    const workspaceId = options.workspaceId || TEST_WORKSPACE_ID
    const actor = 'user'
    const traceId = uuidv4()

    const approvalResult = await ApprovalGuard.executeProtected(
      'EXPORT_DATA', // 导入同样是高危数据操作，复用同一审批类型
      { workspaceId, action: 'import', dataTypes: options.dataTypes },
      actor,
      async () => {
        return await importFromJson(jsonData, options as ImportOptions)
      }
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      return { success: true, status: 'pending_approval', approvalId: approvalResult.approvalId }
    }

    const result = approvalResult.result as { success: boolean }

    await writeAuditLog({
      traceId,
      actor,
      action: 'DATA_IMPORT',
      tool: 'import-export',
      workspaceId,
      request: { dataTypes: options.dataTypes },
      response: result
    })

    if (!result.success) {
      reply.code(400)
    }
    return { success: result.success, data: result }
  })

  // 验证导入数据（不执行导入）
  fastify.post('/api/import/validate', async (request, reply) => {
    const { jsonData } = request.body as { jsonData: string }

    if (!jsonData) {
      reply.code(400)
      return { success: false, error: '缺少 jsonData 参数' }
    }

    try {
      const pkg = JSON.parse(jsonData)
      
      // 基本验证
      if (!pkg.metadata || !pkg.data) {
        reply.code(400)
        return { 
          success: false, 
          error: '无效的导入数据包格式' 
        }
      }

      // 统计各类型数据量
      const stats: Record<string, number> = {}
      for (const [key, value] of Object.entries(pkg.data)) {
        if (Array.isArray(value)) {
          stats[key] = value.length
        }
      }

      return {
        success: true,
        data: {
          version: pkg.metadata.version,
          exportedAt: pkg.metadata.exportedAt,
          sourceWorkspace: pkg.metadata.workspaceId,
          sourceWorkspaceName: pkg.metadata.workspaceName,
          dataStats: stats
        }
      }
    } catch (error) {
      reply.code(400)
      return { success: false, error: `JSON 解析失败: ${(error as Error).message}` }
    }
  })

  // 获取支持的导出数据类型
  fastify.get('/api/export/types', async () => {
    return {
      success: true,
      data: {
        types: [
          { id: 'all', label: '全部数据', description: '导出所有可用数据' },
          { id: 'tickets', label: '工单', description: '工单及关联数据' },
          { id: 'contacts', label: '联系人', description: '联系人信息' },
          { id: 'templates', label: '消息模板', description: '消息模板定义' },
          { id: 'notificationPolicies', label: '通知策略', description: '告警通知策略' }
        ]
      }
    }
  })
}
