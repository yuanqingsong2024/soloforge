/**
 * Workspace Drift 路由模块 - 工作区配置漂移检测
 * 
 * 路由清单：
 * - POST   /api/workspaces/:workspaceId/drift/compute     计算配置漂移
 * - GET    /api/workspaces/:workspaceId/drift/latest      获取最新漂移
 */

import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ConfigManager } from '../config-manager'
import { writeAuditLog } from '../audit-log-writer'
import {
  ok,
  fail,
  toErrorMessage
} from '../api-shared'

// ==================== 路由注册 ====================

export function registerWorkspaceDriftRoutes(fastify: FastifyInstance): void {
  // 计算配置漂移
  fastify.post('/api/workspaces/:workspaceId/drift/compute', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const result = await ConfigManager.computeDrift(workspaceId)

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_COMPUTE',
        tool: 'drift',
        diffId: result.diffId,
        request: { workspaceId },
        response: result
      })

      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_COMPUTE',
        tool: 'drift',
        request: { workspaceId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`计算漂移失败：${errMsg}`)
    }
  })

  // 获取最新漂移
  fastify.get('/api/workspaces/:workspaceId/drift/latest', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const latest = await ConfigManager.getLatestDrift(workspaceId)

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_LATEST',
        tool: 'drift',
        diffId: latest?.id,
        request: { workspaceId },
        response: { found: Boolean(latest) }
      })

      return ok(latest)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DRIFT_LATEST',
        tool: 'drift',
        request: { workspaceId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取最新漂移失败：${errMsg}`)
    }
  })
}
