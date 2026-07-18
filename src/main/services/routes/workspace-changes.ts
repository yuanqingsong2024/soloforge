/**
 * Workspace Changes 路由模块 - 变更请求管理
 * 
 * 路由清单：
 * - POST   /api/workspaces/:workspaceId/change-requests 创建变更单
 * - GET    /api/workspaces/:workspaceId/change-requests  获取变更单列表
 * - GET    /api/change-requests/:id                       获取变更单详情
 * - POST   /api/change-requests/:id/execute               执行变更单
 * - POST   /api/change-requests/:id/rollback              回滚变更单
 */

import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { resolveWorkspaceClaudeCodeClient } from '../workspace-claudecode'
import { ConfigManager } from '../config-manager'
import { ApprovalGuard } from '../approval-guard'
import { writeAuditLog } from '../audit-log-writer'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  isWorkspaceTemporarilyUnlocked,
  emitApiEvent
} from '../api-shared'

// ==================== 类型定义 ====================

interface CreateChangeRequestBody {
  diffId?: string
  type?: string
  title: string
  description: string
  /** 可选：直接提供 diffJson（当不基于 drift 创建时使用） */
  diffJson?: string
}

// ==================== 路由注册 ====================

export function registerWorkspaceChangesRoutes(fastify: FastifyInstance): void {
  // 创建变更单
  fastify.post('/api/workspaces/:workspaceId/change-requests', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }
    const body = request.body as CreateChangeRequestBody

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!body.title || !body.title.trim()) {
        reply.code(400)
        return fail('title 不能为空')
      }
      if (body.description === undefined) {
        reply.code(400)
        return fail('description 不能为空')
      }

      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!ws) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      let changeRequestId: string
      if (body.diffId) {
        changeRequestId = await ConfigManager.createChangeRequestFromDrift(
          workspaceId,
          body.diffId,
          body.title.trim(),
          body.description,
          actor,
          traceId
        )
      } else {
        if (!body.diffJson) {
          reply.code(400)
          return fail('diffId 或 diffJson 必须提供其一')
        }
        // 校验 diffJson 可解析
        try {
          JSON.parse(body.diffJson)
        } catch {
          reply.code(400)
          return fail('diffJson 不是合法 JSON')
        }
        changeRequestId = (
          await prisma.changeRequest.create({
            data: {
              workspaceId,
              type: body.type || 'CONFIG',
              title: body.title.trim(),
              description: body.description,
              diffJson: body.diffJson,
              status: 'DRAFT',
              traceId,
              createdBy: actor
            }
          })
        ).id
      }

      const created = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } })

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_CREATE',
        tool: 'change-request',
        changeRequestId,
        diffId: body.diffId,
        request: { workspaceId, title: body.title, type: body.type || null, diffId: body.diffId || null },
        response: { changeRequestId }
      })

      if (created) {
        await emitApiEvent({
          workspaceId,
          sourceType: 'CHANGE_REQUEST',
          sourceId: created.id,
          eventType: 'CHANGE_REQUEST_CREATED',
          severity: 'INFO',
          title: '变更单已创建',
          summary: created.title,
          payload: {
            changeRequestId: created.id,
            type: created.type,
            status: created.status
          },
          traceId
        })
      }

      return ok(created)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_CREATE',
        tool: 'change-request',
        request: { workspaceId, title: body?.title || null, diffId: body?.diffId || null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`创建变更单失败：${errMsg}`)
    }
  })

  // 获取变更单列表
  fastify.get('/api/workspaces/:workspaceId/change-requests', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId } = request.params as { workspaceId: string }
    const { status, type } = request.query as { status?: string; type?: string }

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }

      const rows = await prisma.changeRequest.findMany({
        where: {
          workspaceId,
          ...(status ? { status } : {}),
          ...(type ? { type } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      })

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_LIST',
        tool: 'change-request',
        request: { workspaceId, status: status || null, type: type || null },
        response: { count: rows.length }
      })

      return ok(rows)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_LIST',
        tool: 'change-request',
        request: { workspaceId, status: status || null, type: type || null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取变更单列表失败：${errMsg}`)
    }
  })

  // 获取变更单详情
  fastify.get('/api/change-requests/:id', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }

    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }

      const changeRequest = await prisma.changeRequest.findUnique({
        where: { id },
        include: { workspace: true }
      })
      if (!changeRequest) {
        reply.code(404)
        return fail('变更单不存在')
      }

      await writeAuditLog({
        workspaceId: changeRequest.workspaceId,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_GET',
        tool: 'change-request',
        changeRequestId: changeRequest.id,
        request: { id },
        response: { changeRequestId: changeRequest.id }
      })

      return ok(changeRequest)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        traceId,
        actor,
        action: 'CHANGE_REQUEST_GET',
        tool: 'change-request',
        request: { id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`获取变更单详情失败：${errMsg}`)
    }
  })

  // 执行变更单
  fastify.post('/api/change-requests/:id/execute', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }

    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }

      const changeRequest = await prisma.changeRequest.findUnique({
        where: { id },
        include: { workspace: true }
      })
      if (!changeRequest) {
        reply.code(404)
        return fail('变更单不存在')
      }

      const workspace = changeRequest.workspace
      const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
      if (workspace.isReadOnlyDefault && !unlocked) {
        reply.code(403)
        await writeAuditLog({
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_BLOCKED',
          tool: 'change-request',
          changeRequestId: changeRequest.id,
          request: { changeRequestId: changeRequest.id },
          response: fail('Workspace 当前为只读模式，且未处于临时解锁窗口')
        })
        return fail('Workspace 当前为只读模式，且未处于临时解锁窗口')
      }

      // 审批：若还没有 approvalId，则创建审批并返回 pending
      if (!changeRequest.approvalId) {
        const approvalResult = await ApprovalGuard.executeProtected(
          'CHANGE_CONFIG',
          { workspaceId: workspace.id, changeRequestId: changeRequest.id, action: 'execute' },
          actor,
          async () => {
            return { requested: true }
          }
        )

        if (approvalResult.needsApproval && approvalResult.approvalId) {
          await prisma.changeRequest.update({
            where: { id: changeRequest.id },
            data: { approvalId: approvalResult.approvalId, status: 'PENDING_APPROVAL' }
          })

          reply.code(202)
          await writeAuditLog({
            workspaceId: workspace.id,
            traceId,
            actor,
            action: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
            tool: 'change-request',
            approvalId: approvalResult.approvalId,
            changeRequestId: changeRequest.id,
            request: { changeRequestId: changeRequest.id },
            response: { status: 'pending_approval', approvalId: approvalResult.approvalId }
          })

          await emitApiEvent({
            workspaceId: workspace.id,
            sourceType: 'CHANGE_REQUEST',
            sourceId: changeRequest.id,
            eventType: 'CHANGE_REQUEST_APPROVAL_REQUESTED',
            severity: 'WARN',
            title: '变更单等待审批',
            summary: `变更单 ${changeRequest.title} 已提交审批`,
            payload: {
              changeRequestId: changeRequest.id,
              approvalId: approvalResult.approvalId
            },
            traceId
          })

          return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '执行变更单需要审批' }
        }
      }

      if (!changeRequest.approvalId) {
        reply.code(500)
        return fail('缺少 approvalId，无法执行变更单')
      }

      // 二次执行守卫：断言审批已通过（actionType=CHANGE_CONFIG）
      try {
        await ApprovalGuard.assertApproved(changeRequest.approvalId, 'CHANGE_CONFIG')
      } catch (assertErr) {
        const errMsg = assertErr instanceof Error ? assertErr.message : String(assertErr)
        reply.code(202)
        await writeAuditLog({
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_PENDING',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          request: { changeRequestId: changeRequest.id },
          response: { status: 'blocked', reason: errMsg }
        })
        return { status: 'pending_approval', approvalId: changeRequest.approvalId, message: '审批未通过或类型不匹配，暂不可执行' }
      }

      // 进入 APPLYING
      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'APPLYING', traceId }
      })

      const { client, profileId } = await resolveWorkspaceClaudeCodeClient(workspace.id)

      let applyResult: unknown
      let snapshotId: string | null = null
      let driftResult: Awaited<ReturnType<typeof ConfigManager.computeDrift>> | null = null

      try {
        applyResult = await client.applyChangeRequest({
          id: changeRequest.id,
          diffJson: changeRequest.diffJson,
          traceId
        })

        await prisma.changeRequest.update({
          where: { id: changeRequest.id },
          data: { status: 'APPLIED' }
        })

        // 自动同步实际快照 + 计算漂移
        const actual = await client.getConfigSnapshot(traceId)
        snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
        driftResult = await ConfigManager.computeDrift(workspace.id)

        await writeAuditLog({
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTED',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          snapshotId,
          diffId: driftResult?.diffId,
          request: { changeRequestId: changeRequest.id, profileId },
          response: { applyResult, snapshotId, drift: driftResult }
        })

        await emitApiEvent({
          workspaceId: workspace.id,
          sourceType: 'CHANGE_REQUEST',
          sourceId: changeRequest.id,
          eventType: 'CHANGE_REQUEST_APPLIED',
          severity: 'INFO',
          title: '变更单已执行',
          summary: `${changeRequest.title} 已成功应用`,
          payload: {
            changeRequestId: changeRequest.id,
            snapshotId,
            drift: driftResult
          },
          traceId
        })

        return ok({ status: 'APPLIED', applyResult, snapshotId, drift: driftResult })
      } catch (applyError) {
        const applyErrMsg = toErrorMessage(applyError)
        await prisma.changeRequest.update({
          where: { id: changeRequest.id },
          data: { status: 'FAILED' }
        })

        // 尝试同步实际快照与漂移（不中断主错误返回）
        try {
          const actual = await client.getConfigSnapshot(traceId)
          snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
          driftResult = await ConfigManager.computeDrift(workspace.id)
        } catch (syncError) {
          fastify.log.error({ traceId, err: toErrorMessage(syncError) }, '执行失败后同步快照/漂移也失败')
        }

        await writeAuditLog({
          workspaceId: workspace.id,
          traceId,
          actor,
          action: 'CHANGE_REQUEST_EXECUTE_FAILED',
          tool: 'change-request',
          approvalId: changeRequest.approvalId,
          changeRequestId: changeRequest.id,
          snapshotId: snapshotId || undefined,
          diffId: driftResult?.diffId,
          request: { changeRequestId: changeRequest.id, profileId },
          response: { error: applyErrMsg, snapshotId, drift: driftResult }
        })

        await emitApiEvent({
          workspaceId: workspace.id,
          sourceType: 'CHANGE_REQUEST',
          sourceId: changeRequest.id,
          eventType: 'CHANGE_REQUEST_FAILED',
          severity: 'ERROR',
          title: '变更单执行失败',
          summary: `${changeRequest.title} 执行失败`,
          payload: {
            changeRequestId: changeRequest.id,
            error: applyErrMsg,
            snapshotId,
            drift: driftResult
          },
          traceId
        })

        reply.code(500)
        return fail(`执行变更单失败：${applyErrMsg}`)
      }
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        traceId,
        actor,
        action: 'CHANGE_REQUEST_EXECUTE',
        tool: 'change-request',
        request: { id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`执行变更单失败：${errMsg}`)
    }
  })

  // 回滚变更单
  fastify.post('/api/change-requests/:id/rollback', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }

    try {
      if (!id) {
        reply.code(400)
        return fail('id 不能为空')
      }

      const changeRequest = await prisma.changeRequest.findUnique({
        where: { id },
        include: { workspace: true }
      })
      if (!changeRequest) {
        reply.code(404)
        return fail('变更单不存在')
      }

      const workspace = changeRequest.workspace
      const unlocked = isWorkspaceTemporarilyUnlocked(workspace)
      if (workspace.isReadOnlyDefault && !unlocked) {
        reply.code(403)
        return fail('Workspace 当前为只读模式，且未处于临时解锁窗口')
      }

      // 回滚策略：回滚到最新 DESIRED 快照（作为期望状态）
      const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
        where: { workspaceId: workspace.id, kind: 'DESIRED' },
        orderBy: { createdAt: 'desc' }
      })
      if (!desiredSnapshot) {
        reply.code(400)
        return fail('缺少 DESIRED 快照，无法回滚')
      }

      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'APPLYING', traceId }
      })

      const desiredConfig = JSON.parse(desiredSnapshot.contentJson) as Record<string, unknown>
      const { client, profileId } = await resolveWorkspaceClaudeCodeClient(workspace.id)

      const rollbackResult = await client.applyConfig(desiredConfig, traceId)
      await prisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'ROLLED_BACK' }
      })

      const actual = await client.getConfigSnapshot(traceId)
      const snapshotId = await ConfigManager.syncActualSnapshot(workspace.id, actual.config, actor)
      const driftResult = await ConfigManager.computeDrift(workspace.id)

      await writeAuditLog({
        workspaceId: workspace.id,
        traceId,
        actor,
        action: 'CHANGE_REQUEST_ROLLED_BACK',
        tool: 'change-request',
        changeRequestId: changeRequest.id,
        snapshotId,
        diffId: driftResult?.diffId,
        request: { changeRequestId: changeRequest.id, profileId, desiredSnapshotId: desiredSnapshot.id },
        response: { rollbackResult, snapshotId, drift: driftResult }
      })

      await emitApiEvent({
        workspaceId: workspace.id,
        sourceType: 'CHANGE_REQUEST',
        sourceId: changeRequest.id,
        eventType: 'CHANGE_REQUEST_ROLLED_BACK',
        severity: 'WARN',
        title: '变更单已回滚',
        summary: `${changeRequest.title} 已恢复到期望状态快照`,
        payload: {
          changeRequestId: changeRequest.id,
          desiredSnapshotId: desiredSnapshot.id,
          snapshotId,
          drift: driftResult
        },
        traceId
      })

      return ok({ status: 'ROLLED_BACK', rollbackResult, snapshotId, drift: driftResult })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        traceId,
        actor,
        action: 'CHANGE_REQUEST_ROLLBACK',
        tool: 'change-request',
        request: { id },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`回滚变更单失败：${errMsg}`)
    }
  })
}
