/**
 * Workspace Settings / Snapshots / Drift / Change Requests 路由模块
 *
 * 管理：
 * - Workspace 环境类型、只读模式、临时解锁
 * - Desired/Actual 配置快照
 * - 漂移检测（Drift Detection）
 * - 变更单（Change Request）完整生命周期
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { ApprovalGuard } from '../approval-guard'
import { ConfigManager } from '../config-manager'
import { resolveWorkspaceClaudeCodeClient } from '../workspace-claudecode'
import { isWorkspaceTemporarilyUnlocked, emitApiEvent } from '../api-shared'
import { extractActor } from '../auth-context'
import { writeAuditLog } from '../audit-log-writer'

type WorkspaceEnvType = 'DEV' | 'STAGING' | 'PROD'
type UnlockDurationMinutes = 15 | 30 | 60

// ==================== Workspace 环境与解锁 ====================

export function registerWorkspaceSettingsRoutes(fastify: FastifyInstance): void {
  // PUT /api/workspaces/:id/env-type - 更新工作区环境类型
  fastify.put('/api/workspaces/:id/env-type', async (request, reply) => {
    const actor = extractActor(request)
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as { envType: WorkspaceEnvType; approvalId?: string }

    if (!workspaceId) {
      reply.code(400)
      return { success: false, error: 'workspaceId 不能为空' }
    }
    if (!['DEV', 'STAGING', 'PROD'].includes(body.envType)) {
      reply.code(400)
      return { success: false, error: 'envType 仅允许 DEV / STAGING / PROD' }
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    // 二次执行守卫
    if (body.approvalId) {
      const { payload } = await ApprovalGuard.assertApproved(body.approvalId, 'CHANGE_WORKSPACE_ENV')
      const parsed = payload as { workspaceId: string; envType: 'DEV' | 'STAGING' | 'PROD' }
      if (!parsed.workspaceId || !parsed.envType) {
        reply.code(400)
        return { success: false, error: '审批载荷格式错误' }
      }
      const updated = await prisma.workspace.update({
        where: { id: parsed.workspaceId },
        data: { envType: parsed.envType }
      })
      await writeAuditLog({
        workspaceId: parsed.workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'WORKSPACE_ENV_CHANGED',
        tool: 'workspace',
        approvalId: body.approvalId,
        request: { workspaceId: parsed.workspaceId, envType: parsed.envType },
        response: { envType: updated.envType, appliedByApproval: true }
      })
      return { success: true, data: updated }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_WORKSPACE_ENV',
      { workspaceId, envType: body.envType },
      actor.userId,
      async () => ({ workspaceId, envType: body.envType })
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      await writeAuditLog({
        workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'WORKSPACE_ENV_CHANGE_REQUESTED',
        tool: 'workspace',
        approvalId: approvalResult.approvalId,
        request: { workspaceId, envType: body.envType },
        response: { status: 'pending_approval' }
      })
      return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '环境类型变更需要审批' }
    }

    const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { envType: body.envType } })
    return { success: true, data: updated }
  })

  // PUT /api/workspaces/:id/read-only - 更新只读模式
  fastify.put('/api/workspaces/:id/read-only', async (request, reply) => {
    const actor = extractActor(request)
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as { isReadOnlyDefault: boolean }

    if (typeof body.isReadOnlyDefault !== 'boolean') {
      reply.code(400)
      return { success: false, error: 'isReadOnlyDefault 必须为 boolean' }
    }

    const existing = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!existing) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { isReadOnlyDefault: body.isReadOnlyDefault }
    })

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_READONLY_UPDATED',
      tool: 'workspace',
      request: { workspaceId, isReadOnlyDefault: body.isReadOnlyDefault },
      response: { isReadOnlyDefault: updated.isReadOnlyDefault }
    })

    return { success: true, data: updated }
  })

  // POST /api/workspaces/:id/unlock - 临时解锁工作区
  fastify.post('/api/workspaces/:id/unlock', async (request, reply) => {
    const actor = extractActor(request)
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as { durationMinutes: UnlockDurationMinutes; approvalId?: string }

    if (![15, 30, 60].includes(body.durationMinutes)) {
      reply.code(400)
      return { success: false, error: 'durationMinutes 仅允许 15 / 30 / 60' }
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    const unlockUntil = new Date(Date.now() + body.durationMinutes * 60_000)

    // 二次执行守卫
    if (body.approvalId) {
      const { payload } = await ApprovalGuard.assertApproved(body.approvalId, 'UNLOCK_WORKSPACE')
      const parsed = payload as { workspaceId: string; unlockUntil: string }
      const unlockUntilDate = new Date(parsed.unlockUntil)
      const updated = await prisma.workspace.update({
        where: { id: parsed.workspaceId },
        data: { unlockUntil: unlockUntilDate }
      })
      await writeAuditLog({
        workspaceId: parsed.workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'WORKSPACE_UNLOCKED',
        tool: 'workspace',
        approvalId: body.approvalId,
        request: { workspaceId: parsed.workspaceId, unlockUntil: parsed.unlockUntil },
        response: { unlockUntil: updated.unlockUntil?.toISOString() || null }
      })
      return { success: true, data: { unlockUntil: updated.unlockUntil } }
    }

    const approvalResult = await ApprovalGuard.executeProtected(
      'UNLOCK_WORKSPACE',
      { workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() },
      actor.userId,
      async () => ({ workspaceId, unlockUntil })
    )

    if (approvalResult.needsApproval) {
      reply.code(202)
      await writeAuditLog({
        workspaceId,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'WORKSPACE_UNLOCK_REQUESTED',
        tool: 'workspace',
        approvalId: approvalResult.approvalId,
        request: { workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() },
        response: { status: 'pending_approval' }
      })
      return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '临时解锁需要审批' }
    }

    return { success: true, data: { unlockUntil } }
  })

  // POST /api/workspaces/:workspaceId/snapshots/desired - 保存期望状态快照
  fastify.post('/api/workspaces/:workspaceId/snapshots/desired', async (request, reply) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const body = request.body as { config: unknown }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    const snapshotId = await ConfigManager.saveDesiredSnapshot(workspaceId, body.config, actor.userId)

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_DESIRED_SNAPSHOT_SAVED',
      tool: 'workspace-snapshot',
      snapshotId,
      request: { workspaceId },
      response: { snapshotId }
    })

    return { success: true, data: { snapshotId } }
  })

  // POST /api/workspaces/:workspaceId/snapshots/actual - 同步实际状态快照
  fastify.post('/api/workspaces/:workspaceId/snapshots/actual', async (request, reply) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    const { profileId, client } = await resolveWorkspaceClaudeCodeClient(workspaceId)
    const snapshot = await client.getConfigSnapshot(actor.traceId)
    const snapshotId = await ConfigManager.syncActualSnapshot(workspaceId, snapshot.config, actor.userId)

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_ACTUAL_SNAPSHOT_SYNCED',
      tool: 'workspace-snapshot',
      snapshotId,
      request: { workspaceId, profileId },
      response: { snapshotId, hash: snapshot.hash }
    })

    return { success: true, data: { snapshotId, hash: snapshot.hash } }
  })

  // GET /api/workspaces/:workspaceId/snapshots - 获取快照列表
  fastify.get('/api/workspaces/:workspaceId/snapshots', async (request) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }

    const rows = await prisma.workspaceSnapshot.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_SNAPSHOT_LIST',
      tool: 'workspace-snapshot',
      request: { workspaceId },
      response: { count: rows.length }
    })

    return { success: true, data: rows }
  })

  // POST /api/workspaces/:workspaceId/drift/compute - 计算漂移
  fastify.post('/api/workspaces/:workspaceId/drift/compute', async (request) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }

    const result = await ConfigManager.computeDrift(workspaceId)

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_DRIFT_COMPUTE',
      tool: 'drift',
      diffId: result.diffId,
      request: { workspaceId },
      response: result
    })

    return { success: true, data: result }
  })

  // GET /api/workspaces/:workspaceId/drift/latest - 获取最新漂移
  fastify.get('/api/workspaces/:workspaceId/drift/latest', async (request) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }

    const latest = await ConfigManager.getLatestDrift(workspaceId)

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'WORKSPACE_DRIFT_LATEST',
      tool: 'drift',
      diffId: latest?.id,
      request: { workspaceId },
      response: { found: Boolean(latest) }
    })

    return { success: true, data: latest }
  })

  // POST /api/workspaces/:workspaceId/change-requests - 创建变更单
  fastify.post('/api/workspaces/:workspaceId/change-requests', async (request, reply) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const body = request.body as { diffId?: string; type?: string; title: string; description: string; diffJson?: string }

    if (!body.title?.trim()) {
      reply.code(400)
      return { success: false, error: 'title 不能为空' }
    }
    if (body.description === undefined) {
      reply.code(400)
      return { success: false, error: 'description 不能为空' }
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) {
      reply.code(404)
      return { success: false, error: 'Workspace 不存在' }
    }

    let changeRequestId: string
    if (body.diffId) {
      changeRequestId = await ConfigManager.createChangeRequestFromDrift(
        workspaceId, body.diffId, body.title.trim(), body.description, actor.userId, actor.traceId
      )
    } else {
      if (!body.diffJson) {
        reply.code(400)
        return { success: false, error: 'diffId 或 diffJson 必须提供其一' }
      }
      try { JSON.parse(body.diffJson) } catch {
        reply.code(400)
        return { success: false, error: 'diffJson 不是合法 JSON' }
      }
      changeRequestId = (await prisma.changeRequest.create({
        data: {
          workspaceId, type: body.type || 'CONFIG', title: body.title.trim(), description: body.description,
          diffJson: body.diffJson, status: 'DRAFT', traceId: actor.traceId, createdBy: actor.userId
        }
      })).id
    }

    const created = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } })

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'CHANGE_REQUEST_CREATE',
      tool: 'change-request',
      changeRequestId,
      diffId: body.diffId,
      request: { workspaceId, title: body.title, type: body.type || null, diffId: body.diffId || null },
      response: { changeRequestId }
    })

    if (created) {
      await emitApiEvent({
        workspaceId, sourceType: 'CHANGE_REQUEST', sourceId: created.id,
        eventType: 'CHANGE_REQUEST_CREATED', severity: 'INFO',
        title: '变更单已创建', summary: created.title,
        payload: { changeRequestId: created.id, type: created.type, status: created.status }, traceId: actor.traceId
      })
    }

    return { success: true, data: created }
  })

  // GET /api/workspaces/:workspaceId/change-requests - 获取变更单列表
  fastify.get('/api/workspaces/:workspaceId/change-requests', async (request) => {
    const actor = extractActor(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const { status, type } = request.query as { status?: string; type?: string }

    const rows = await prisma.changeRequest.findMany({
      where: { workspaceId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' }, take: 100
    })

    await writeAuditLog({
      workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'CHANGE_REQUEST_LIST',
      tool: 'change-request',
      request: { workspaceId, status: status || null, type: type || null },
      response: { count: rows.length }
    })

    return { success: true, data: rows }
  })

  // GET /api/change-requests/:id - 获取变更单详情
  fastify.get('/api/change-requests/:id', async (request, reply) => {
    const actor = extractActor(request)
    const { id } = request.params as { id: string }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return { success: false, error: '变更单不存在' }
    }

    await writeAuditLog({
      workspaceId: changeRequest.workspaceId,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'CHANGE_REQUEST_GET',
      tool: 'change-request',
      changeRequestId: changeRequest.id,
      request: { id },
      response: { changeRequestId: changeRequest.id }
    })

    return { success: true, data: changeRequest }
  })

  // POST /api/change-requests/:id/execute - 执行变更单
  fastify.post('/api/change-requests/:id/execute', async (request, reply) => {
    const actor = extractActor(request)
    const { id } = request.params as { id: string }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return { success: false, error: '变更单不存在' }
    }

    const workspace = changeRequest.workspace
    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    if (workspace.isReadOnlyDefault && !unlocked) {
      reply.code(403)
      await writeAuditLog({
        workspaceId: workspace.id,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'CHANGE_REQUEST_EXECUTE_BLOCKED',
        tool: 'change-request',
        changeRequestId: changeRequest.id,
        request: { changeRequestId: changeRequest.id },
        response: { success: false, error: 'Workspace 当前为只读模式，且未处于临时解锁窗口' }
      })
      return { success: false, error: 'Workspace 当前为只读模式，且未处于临时解锁窗口' }
    }

    // 创建审批
    if (!changeRequest.approvalId) {
      const approvalResult = await ApprovalGuard.executeProtected(
        'CHANGE_CONFIG',
        { workspaceId: workspace.id, changeRequestId: changeRequest.id, action: 'execute' },
        actor.userId,
        async () => ({ requested: true })
      )

      if (approvalResult.needsApproval && approvalResult.approvalId) {
        await prisma.changeRequest.update({
          where: { id: changeRequest.id },
          data: { approvalId: approvalResult.approvalId, status: 'PENDING_APPROVAL' }
        })
        reply.code(202)
        await writeAuditLog({
          workspaceId: workspace.id,
          traceId: actor.traceId,
          actor: actor.userId,
          action: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
          tool: 'change-request',
          approvalId: approvalResult.approvalId,
          changeRequestId: changeRequest.id,
          request: { changeRequestId: changeRequest.id },
          response: { status: 'pending_approval', approvalId: approvalResult.approvalId }
        })
        await emitApiEvent({
          workspaceId: workspace.id, sourceType: 'CHANGE_REQUEST', sourceId: changeRequest.id,
          eventType: 'CHANGE_REQUEST_APPROVAL_REQUESTED', severity: 'WARN',
          title: '变更单等待审批', summary: `变更单 ${changeRequest.title} 已提交审批`,
          payload: { changeRequestId: changeRequest.id, approvalId: approvalResult.approvalId }, traceId: actor.traceId
        })
        return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '执行变更单需要审批' }
      }
    }

    // 二次执行守卫
    if (!changeRequest.approvalId) {
      reply.code(500)
      return { success: false, error: '缺少 approvalId，无法执行变更单' }
    }

    try {
      await ApprovalGuard.assertApproved(changeRequest.approvalId, 'CHANGE_CONFIG')
    } catch (assertErr) {
      reply.code(202)
      await writeAuditLog({
        workspaceId: workspace.id,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'CHANGE_REQUEST_EXECUTE_PENDING',
        tool: 'change-request',
        approvalId: changeRequest.approvalId,
        changeRequestId: changeRequest.id,
        request: { changeRequestId: changeRequest.id },
        response: { status: 'blocked', reason: assertErr instanceof Error ? assertErr.message : String(assertErr) }
      })
      return { status: 'pending_approval', approvalId: changeRequest.approvalId, message: '审批未通过' }
    }

    // 执行变更
    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'APPLYING', traceId: actor.traceId }
    })

    const { client, profileId } = await resolveWorkspaceClaudeCodeClient(workspace.id)
    let snapshotId: string | null = null
    let driftResult: Awaited<ReturnType<typeof ConfigManager.computeDrift>> | null = null

    try {
      await client.applyChangeRequest({
        id: changeRequest.id,
        diffJson: changeRequest.diffJson,
        traceId: actor.traceId
      })

      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'APPLIED' }
      })

      const actual = await client.getConfigSnapshot(actor.traceId)
      snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor.userId)
      driftResult = await ConfigManager.computeDrift(workspace.id)

      await writeAuditLog({
        workspaceId: workspace.id,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'CHANGE_REQUEST_EXECUTED',
        tool: 'change-request',
        approvalId: changeRequest.approvalId,
        changeRequestId: changeRequest.id,
        snapshotId,
        diffId: driftResult?.diffId,
        request: { changeRequestId: changeRequest.id, profileId },
        response: { snapshotId, drift: driftResult }
      })

      await emitApiEvent({
        workspaceId: workspace.id, sourceType: 'CHANGE_REQUEST', sourceId: changeRequest.id,
        eventType: 'CHANGE_REQUEST_APPLIED', severity: 'INFO',
        title: '变更单已执行', summary: `${changeRequest.title} 已成功应用`,
        payload: { changeRequestId: changeRequest.id, snapshotId, drift: driftResult }, traceId: actor.traceId
      })

      return { status: 'APPLIED', snapshotId, drift: driftResult }
    } catch (applyError) {
      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'FAILED' }
      })
      const applyErrMsg = applyError instanceof Error ? applyError.message : String(applyError)

      try {
        const actual = await client.getConfigSnapshot(actor.traceId)
        snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor.userId)
        driftResult = await ConfigManager.computeDrift(workspace.id)
      } catch { /* sync 失败不阻断主错误 */ }

      await writeAuditLog({
        workspaceId: workspace.id,
        traceId: actor.traceId,
        actor: actor.userId,
        action: 'CHANGE_REQUEST_EXECUTE_FAILED',
        tool: 'change-request',
        approvalId: changeRequest.approvalId,
        changeRequestId: changeRequest.id,
        snapshotId: snapshotId || undefined,
        diffId: driftResult?.diffId,
        request: { changeRequestId: changeRequest.id, profileId },
        response: { error: applyErrMsg, snapshotId, drift: driftResult }
      })

      reply.code(500)
      return { success: false, error: `执行变更单失败：${applyErrMsg}` }
    }
  })

  // POST /api/change-requests/:id/rollback - 回滚变更单
  fastify.post('/api/change-requests/:id/rollback', async (request, reply) => {
    const actor = extractActor(request)
    const { id } = request.params as { id: string }

    const changeRequest = await prisma.changeRequest.findUnique({
      where: { id },
      include: { workspace: true }
    })
    if (!changeRequest) {
      reply.code(404)
      return { success: false, error: '变更单不存在' }
    }

    const workspace = changeRequest.workspace
    const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
    if (workspace.isReadOnlyDefault && !unlocked) {
      reply.code(403)
      return { success: false, error: 'Workspace 当前为只读模式，且未处于临时解锁窗口' }
    }

    const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
      where: { workspaceId: workspace.id, kind: 'DESIRED' },
      orderBy: { createdAt: 'desc' }
    })
    if (!desiredSnapshot) {
      reply.code(400)
      return { success: false, error: '缺少 DESIRED 快照，无法回滚' }
    }

    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'APPLYING', traceId: actor.traceId }
    })

    const desiredConfig = JSON.parse(desiredSnapshot.contentJson) as Record<string, unknown>
    const { client, profileId } = await resolveWorkspaceClaudeCodeClient(workspace.id)
    await client.applyConfig(desiredConfig, actor.traceId)

    await prisma.changeRequest.update({
      where: { id: changeRequest.id },
      data: { status: 'ROLLED_BACK' }
    })

    const actual = await client.getConfigSnapshot(actor.traceId)
    const snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor.userId)
    const driftResult = await ConfigManager.computeDrift(workspace.id)

    await writeAuditLog({
      workspaceId: workspace.id,
      traceId: actor.traceId,
      actor: actor.userId,
      action: 'CHANGE_REQUEST_ROLLED_BACK',
      tool: 'change-request',
      changeRequestId: changeRequest.id,
      snapshotId,
      diffId: driftResult?.diffId,
      request: { changeRequestId: changeRequest.id, profileId, desiredSnapshotId: desiredSnapshot.id },
      response: { snapshotId, drift: driftResult }
    })

    await emitApiEvent({
      workspaceId: workspace.id, sourceType: 'CHANGE_REQUEST', sourceId: changeRequest.id,
      eventType: 'CHANGE_REQUEST_ROLLED_BACK', severity: 'WARN',
      title: '变更单已回滚', summary: `${changeRequest.title} 已恢复到期望状态快照`,
      payload: { changeRequestId: changeRequest.id, desiredSnapshotId: desiredSnapshot.id, snapshotId, drift: driftResult }, traceId: actor.traceId
    })

    return { status: 'ROLLED_BACK', snapshotId, drift: driftResult }
  })
}
