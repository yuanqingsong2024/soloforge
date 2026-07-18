/**
 * Workspace Snapshots 路由模块 - 工作区快照管理
 * 
 * 路由清单：
 * - POST   /api/workspaces/:workspaceId/snapshots/desired 保存期望状态快照
 * - POST   /api/workspaces/:workspaceId/snapshots/actual  同步实际状态快照
 * - GET    /api/workspaces/:workspaceId/snapshots         获取快照列表
 */

import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { resolveWorkspaceClaudeCodeClient } from '../workspace-claudecode'
import { ConfigManager } from '../config-manager'
import { writeAuditLog } from '../audit-log-writer'
import {
  prisma,
  ok,
  fail,
  toErrorMessage
} from '../api-shared'

// ==================== 类型定义 ====================

interface SaveDesiredSnapshotBody {
  config: unknown
}

// ==================== 路由注册 ====================

export function registerWorkspaceSnapshotsRoutes(fastify: FastifyInstance): void {
  // 保存期望状态快照
  fastify.post('/api/workspaces/:workspaceId/snapshots/desired', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }
    const body = request.body as SaveDesiredSnapshotBody

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!ws) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      const snapshotId = await ConfigManager.saveDesiredSnapshot(workspaceId, body.config, actor)

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DESIRED_SNAPSHOT_SAVED',
        tool: 'workspace-snapshot',
        snapshotId,
        request: { workspaceId },
        response: { snapshotId }
      })

      return ok({ snapshotId })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_DESIRED_SNAPSHOT_SAVED',
        tool: 'workspace-snapshot',
        request: { workspaceId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`保存期望状态快照失败：${errMsg}`)
    }
  })

  // 同步实际状态快照
  fastify.post('/api/workspaces/:workspaceId/snapshots/actual', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!ws) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      const { profileId, client } = await resolveWorkspaceClaudeCodeClient(workspaceId)
      const snapshot = await client.getConfigSnapshot(traceId)
      const snapshotId = await ConfigManager.syncActualSnapshot(workspaceId, snapshot.config, actor)

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ACTUAL_SNAPSHOT_SYNCED',
        tool: 'workspace-snapshot',
        snapshotId,
        request: { workspaceId, profileId },
        response: { snapshotId, hash: snapshot.hash }
      })

      return ok({ snapshotId, hash: snapshot.hash })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ACTUAL_SNAPSHOT_SYNCED',
        tool: 'workspace-snapshot',
        request: { workspaceId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`同步实际状态快照失败：${errMsg}`)
    }
  })

  // 获取快照列表
  fastify.get('/api/workspaces/:workspaceId/snapshots', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const rows = await prisma.workspaceSnapshot.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100
      })

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_SNAPSHOT_LIST',
        tool: 'workspace-snapshot',
        request: { workspaceId },
        response: { count: rows.length }
      })

      return ok(rows)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_SNAPSHOT_LIST',
        tool: 'workspace-snapshot',
        request: { workspaceId },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取快照列表失败：${errMsg}`)
    }
  })
}
