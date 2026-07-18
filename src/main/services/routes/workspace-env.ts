/**
 * Workspace Environment 路由模块 - 工作区环境管理
 * 
 * 路由清单：
 * - PUT    /api/workspaces/:id/env-type                  更新工作区环境类型
 * - PUT    /api/workspaces/:id/read-only                 更新工作区只读模式
 * - POST   /api/workspaces/:id/unlock                    临时解锁工作区
 */

import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalGuard } from '../approval-guard'
import { writeAuditLog } from '../audit-log-writer'
import {
  prisma,
  ok,
  fail,
  toErrorMessage
} from '../api-shared'

// ==================== 类型定义 ====================

type WorkspaceEnvType = 'DEV' | 'STAGING' | 'PROD'
type UnlockDurationMinutes = 15 | 30 | 60

interface UpdateWorkspaceEnvTypeBody {
  envType: WorkspaceEnvType
  /** 可选：当审批通过后，携带 approvalId 再次调用以执行变更 */
  approvalId?: string
}

interface UpdateWorkspaceReadOnlyBody {
  isReadOnlyDefault: boolean
}

interface UnlockWorkspaceBody {
  durationMinutes: UnlockDurationMinutes
  /** 可选：当审批通过后，携带 approvalId 再次调用以执行解锁 */
  approvalId?: string
}

// ==================== 路由注册 ====================

export function registerWorkspaceEnvRoutes(fastify: FastifyInstance): void {
  // 更新工作区环境类型
  fastify.put('/api/workspaces/:id/env-type', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as UpdateWorkspaceEnvTypeBody

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      const envType = body.envType
      if (envType !== 'DEV' && envType !== 'STAGING' && envType !== 'PROD') {
        reply.code(400)
        return fail('envType 仅允许 DEV / STAGING / PROD')
      }

      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!workspace) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      if (body.approvalId) {
        // 二次执行守卫：断言审批已通过（actionType=CHANGE_WORKSPACE_ENV）
        const { payload } = await ApprovalGuard.assertApproved(
          body.approvalId,
          'CHANGE_WORKSPACE_ENV'
        )

        const parsed = payload as { workspaceId: string; envType: 'DEV' | 'STAGING' | 'PROD' }
        if (!parsed.workspaceId || !parsed.envType) {
          reply.code(400)
          return fail('审批载荷格式错误，无法执行 Workspace 环境类型变更')
        }

        const updated = await prisma.workspace.update({
          where: { id: parsed.workspaceId },
          data: { envType: parsed.envType }
        })

        await writeAuditLog({
          workspaceId: parsed.workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_ENV_CHANGED',
          tool: 'workspace',
          approvalId: body.approvalId,
          request: { workspaceId: parsed.workspaceId, envType: parsed.envType },
          response: { envType: updated.envType, appliedByApproval: true }
        })

        return ok(updated)
      }

      const approvalResult = await ApprovalGuard.executeProtected(
        'CHANGE_WORKSPACE_ENV',
        { workspaceId, envType },
        actor,
        async () => {
          return { workspaceId, envType }
        }
      )

      if (approvalResult.needsApproval) {
        reply.code(202)
        await writeAuditLog({
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_ENV_CHANGE_REQUESTED',
          tool: 'workspace',
          approvalId: approvalResult.approvalId,
          request: { workspaceId, envType },
          response: { status: 'pending_approval' }
        })
        return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '环境类型变更需要审批' }
      }

      // 理论上不会走到这里（CHANGE_WORKSPACE_ENV 属于高危动作）
      const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { envType } })
      return ok(updated)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_ENV_CHANGE',
        tool: 'workspace',
        request: { workspaceId, envType: body?.envType || null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`更新 Workspace 环境类型失败：${errMsg}`)
    }
  })

  // 更新工作区只读模式
  fastify.put('/api/workspaces/:id/read-only', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as UpdateWorkspaceReadOnlyBody

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (typeof body.isReadOnlyDefault !== 'boolean') {
        reply.code(400)
        return fail('isReadOnlyDefault 必须为 boolean')
      }

      const existing = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!existing) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { isReadOnlyDefault: body.isReadOnlyDefault }
      })

      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_READONLY_UPDATED',
        tool: 'workspace',
        request: { workspaceId, isReadOnlyDefault: body.isReadOnlyDefault },
        response: { isReadOnlyDefault: updated.isReadOnlyDefault }
      })

      return ok(updated)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_READONLY_UPDATED',
        tool: 'workspace',
        request: { workspaceId, isReadOnlyDefault: body?.isReadOnlyDefault ?? null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`更新 Workspace 只读模式失败：${errMsg}`)
    }
  })

  // 临时解锁工作区
  fastify.post('/api/workspaces/:id/unlock', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id: workspaceId } = request.params as { id: string }
    const body = request.body as UnlockWorkspaceBody

    try {
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (body.durationMinutes !== 15 && body.durationMinutes !== 30 && body.durationMinutes !== 60) {
        reply.code(400)
        return fail('durationMinutes 仅允许 15 / 30 / 60')
      }

      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!workspace) {
        reply.code(404)
        return fail('Workspace 不存在')
      }

      const unlockUntil = new Date(Date.now() + body.durationMinutes * 60_000)

      if (body.approvalId) {
        // 二次执行守卫：断言审批已通过（actionType=UNLOCK_WORKSPACE）
        const { payload } = await ApprovalGuard.assertApproved(
          body.approvalId,
          'UNLOCK_WORKSPACE'
        )

        const parsed = payload as { workspaceId: string; unlockUntil: string }
        if (!parsed.workspaceId || !parsed.unlockUntil) {
          reply.code(400)
          return fail('审批载荷格式错误，无法执行 Workspace 临时解锁')
        }

        const unlockUntilDate = new Date(parsed.unlockUntil)
        const updated = await prisma.workspace.update({
          where: { id: parsed.workspaceId },
          data: { unlockUntil: unlockUntilDate }
        })

        await writeAuditLog({
          workspaceId: parsed.workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_UNLOCKED',
          tool: 'workspace',
          approvalId: body.approvalId,
          request: { workspaceId: parsed.workspaceId, unlockUntil: parsed.unlockUntil },
          response: { unlockUntil: updated.unlockUntil?.toISOString() || null, appliedByApproval: true }
        })

        return ok({ unlockUntil: updated.unlockUntil })
      }

      const approvalResult = await ApprovalGuard.executeProtected(
        'UNLOCK_WORKSPACE',
        { workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() },
        actor,
        async () => {
          return { workspaceId, unlockUntil }
        }
      )

      if (approvalResult.needsApproval) {
        reply.code(202)
        await writeAuditLog({
          workspaceId,
          traceId,
          actor,
          action: 'WORKSPACE_UNLOCK_REQUESTED',
          tool: 'workspace',
          approvalId: approvalResult.approvalId,
          request: { workspaceId, durationMinutes: body.durationMinutes, unlockUntil: unlockUntil.toISOString() },
          response: { status: 'pending_approval' }
        })
        return { status: 'pending_approval', approvalId: approvalResult.approvalId, message: '临时解锁需要审批' }
      }

      // 理论上不会走到这里（UNLOCK_WORKSPACE 属于高危动作）
      return ok({ unlockUntil })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'WORKSPACE_UNLOCK',
        tool: 'workspace',
        request: { workspaceId, durationMinutes: body?.durationMinutes ?? null },
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`Workspace 临时解锁失败：${errMsg}`)
    }
  })
}
