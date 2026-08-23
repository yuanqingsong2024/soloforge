import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { ApprovalExecutor } from './approval-executor'
import { registerTicketRoutes } from './routes/tickets'
import { registerApprovalRoutes } from './routes/approvals'
import { registerTeamRoutes } from './routes/team'
import { registerCommsProfilesRoutes } from './routes/comms-profiles'
import { registerCommsTargetsRoutes } from './routes/comms-targets'
import { registerContactsRoutes } from './routes/contacts'
import { registerMessageTemplatesRoutes } from './routes/message-templates'
import { registerOutboundMessagesRoutes } from './routes/outbound-messages'
import { registerJobsRoutes } from './routes/jobs'
import { registerModelsRoutes } from './routes/models'
import { registerBackupRoutes } from './routes/backup'
import { registerSearchRoutes } from './routes/search'
import { registerDoctorRoutes } from './routes/doctor'
import { registerAlertsRoutes } from './routes/alerts'
import { registerNotificationPolicyRoutes } from './routes/notification-policies'
import { registerDoctorSchedulerRoutes } from './routes/doctor-scheduler'
import { registerOperationsRoutes } from './routes/operations'
import { registerInfrastructureRoutes } from './routes/infrastructure'
import { registerReleaseRoutes } from './routes/release'
import { registerWorkspacesRoutes } from './routes/workspaces'
import { registerWorkspaceRoutes } from './routes/workspace-routes'
// workspace-snapshots.ts、workspace-drift.ts、workspace-changes.ts 的路由已合并到 workspace-settings.ts 中
import { registerWorkspaceSettingsRoutes } from './routes/workspace-settings'
import { registerPoliciesRoutes } from './routes/policies'
import { registerDeploymentRoutes } from './routes/deployments'
import { registerOpenClawRoutes } from './routes/openclaw'
import { registerPluginRoutes } from './plugins/plugin-routes'
import { registerImportExportRoutes } from './routes/import-export'
import { registerAuditExportRoutes } from './routes/audit-export'
import { registerHermesRoutes } from './routes/hermes-workers'
import { registerAuthenticatedRoutes } from '../middleware/local-auth'
import {
  prisma,
  fastify,
  toErrorMessage,
  isE2ETestMode,
  writeApiAuditLog
} from './api-shared'
import { dispatchOutboundMessage } from './openclaw-helpers'
import { writeAuditLog } from './audit-log-writer'
import { optimizeSqlite } from './db'


export async function startServer(): Promise<number> {
  // 应用 SQLite PRAGMA 优化（处理网络驱动器延迟）
  await optimizeSqlite()

  fastify.setErrorHandler((error, request, reply) => {
    const traceId = (request.headers['x-trace-id'] as string | undefined) || uuidv4()
    const isValidationError = error.statusCode === 400 && Boolean((error as { validation?: unknown }).validation)
    const statusCode = error.statusCode ?? 500
    const message = toErrorMessage(error)

    void writeApiAuditLog({
      traceId,
      actor: 'system',
      action: isValidationError ? 'REQUEST_VALIDATION_FAILED' : 'REQUEST_UNHANDLED_ERROR',
      tool: 'api-server',
      request: { method: request.method, url: request.url },
      response: { success: false, statusCode, error: message }
    }).catch(() => {})

    reply.code(statusCode).send({ success: false, error: message })
  })

  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ success: false, error: `路由不存在: ${request.method} ${request.url}` })
  })

  try {
    registerAuthenticatedRoutes(fastify)
    registerApprovalHandlers()

    registerTicketRoutes(fastify)
    registerApprovalRoutes(fastify)
    registerTeamRoutes(fastify)
    registerCommsProfilesRoutes(fastify)
    registerCommsTargetsRoutes(fastify)
    registerContactsRoutes(fastify)
    registerMessageTemplatesRoutes(fastify)
    registerOutboundMessagesRoutes(fastify)
    registerJobsRoutes(fastify)
    registerWorkspacesRoutes(fastify)
    registerWorkspaceRoutes(fastify)
    // workspace-snapshots、workspace-drift、workspace-changes 路由已在 workspace-settings 中定义
    registerWorkspaceSettingsRoutes(fastify)
    registerPoliciesRoutes(fastify)
    registerModelsRoutes(fastify)
    registerBackupRoutes(fastify)
    registerSearchRoutes(fastify)
    registerDoctorRoutes(fastify)
    registerAlertsRoutes(fastify)
    registerNotificationPolicyRoutes(fastify)
    registerDoctorSchedulerRoutes(fastify)
    registerOperationsRoutes(fastify)
    registerInfrastructureRoutes(fastify)
    registerReleaseRoutes(fastify)
    registerDeploymentRoutes(fastify)
    registerOpenClawRoutes(fastify)
    registerPluginRoutes(fastify)
    registerImportExportRoutes(fastify)
    registerAuditExportRoutes(fastify)
    registerHermesRoutes(fastify)

    const DEV_PORT = 13789
    const SAFE_PORT_CANDIDATES = [23119, 23120, 23121, 23122, 23123, 23124, 23125, 23126]
    const isDev = !app.isPackaged
    const portCandidates = isDev && !isE2ETestMode() ? [DEV_PORT, ...SAFE_PORT_CANDIDATES] : SAFE_PORT_CANDIDATES

    for (const candidate of portCandidates) {
      try {
        await fastify.listen({ port: candidate, host: '127.0.0.1' })
        const actualPort = (fastify.server.address() as { port: number }).port
        fastify.log.info(`Local API server listening on port ${actualPort}`)
        return actualPort
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code !== 'EADDRINUSE') throw error
        if (candidate === DEV_PORT) fastify.log.warn(`开发端口 ${DEV_PORT} 已被占用，自动切换到备用端口`)
      }
    }
    throw new Error('无法为本地 API 服务器分配安全端口')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

function registerApprovalHandlers(): void {
  ApprovalExecutor.registerApproved('SEND_EXTERNAL', async (approval, payload) => {
    const parsed = payload as { outboundMessageId: string; traceId: string; channel: string; to: string }
    if (!parsed.outboundMessageId) throw new Error('SEND_EXTERNAL 审批 payload 缺少 outboundMessageId')
    await prisma.outboundMessage.update({ where: { id: parsed.outboundMessageId }, data: { status: 'APPROVED', lastError: null } })
    return await dispatchOutboundMessage(parsed.outboundMessageId, approval.approvedBy || approval.requestedBy)
  })

  ApprovalExecutor.registerRejected('SEND_EXTERNAL', async (approval, payload) => {
    const parsed = payload as { outboundMessageId: string; traceId: string }
    if (!parsed.outboundMessageId) return
    const message = await prisma.outboundMessage.findUnique({ where: { id: parsed.outboundMessageId } })
    if (!message) return
    await prisma.outboundMessage.update({ where: { id: parsed.outboundMessageId }, data: { status: 'CANCELED', lastError: '审批拒绝，未发送' } })
    await writeAuditLog({ traceId: parsed.traceId, actor: approval.approvedBy || approval.requestedBy, action: 'OUTBOUND_CANCELED', tool: 'approval', approvalId: approval.id, outboundMessageId: parsed.outboundMessageId, request: { reason: 'approval_rejected' }, response: { status: 'CANCELED' } })
  })

  ApprovalExecutor.registerApproved('CHANGE_CONFIG', async (approval, payload) => {
    const parsed = payload as { kind?: string; targetId?: string; channel?: string; to?: string }
    if (parsed.kind === 'ALLOWLIST_TARGET' && parsed.targetId) {
      const target = await prisma.commsTarget.update({ where: { id: parsed.targetId }, data: { allowlisted: true } })
      const traceId = uuidv4()
      await writeAuditLog({ traceId, actor: approval.approvedBy || approval.requestedBy, action: 'ALLOWLIST_TARGET_APPROVED', tool: 'communications', request: { targetId: parsed.targetId, channel: parsed.channel, to: parsed.to }, response: { allowlisted: true } })
      return { target, traceId }
    }
    await writeAuditLog({ traceId: uuidv4(), actor: approval.approvedBy || approval.requestedBy, action: 'CHANGE_CONFIG_EXECUTED', tool: 'approval', approvalId: approval.id, request: parsed, response: { status: 'not_implemented', kind: parsed.kind } })
    return { status: 'not_implemented' }
  })

  ApprovalExecutor.registerApproved('CHANGE_WORKSPACE_ENV', async (approval, payload) => {
    const parsed = payload as { workspaceId: string; envType: 'DEV' | 'STAGING' | 'PROD' }
    if (!parsed.workspaceId || !parsed.envType) throw new Error('CHANGE_WORKSPACE_ENV 审批 payload 缺少必要字段')
    const updatedWorkspace = await prisma.workspace.update({ where: { id: parsed.workspaceId }, data: { envType: parsed.envType } })
    const traceId = uuidv4()
    await writeAuditLog({ workspaceId: parsed.workspaceId, traceId, actor: approval.approvedBy || approval.requestedBy, action: 'WORKSPACE_ENV_CHANGED', tool: 'approval', approvalId: approval.id, request: { workspaceId: parsed.workspaceId, envType: parsed.envType }, response: { envType: updatedWorkspace.envType, appliedByApproval: true } })
    return updatedWorkspace
  })

  ApprovalExecutor.registerApproved('UNLOCK_WORKSPACE', async (approval, payload) => {
    const parsed = payload as { workspaceId: string; unlockUntil: string }
    if (!parsed.workspaceId || !parsed.unlockUntil) throw new Error('UNLOCK_WORKSPACE 审批 payload 缺少必要字段')
    const unlockUntil = new Date(parsed.unlockUntil)
    const updatedWorkspace = await prisma.workspace.update({ where: { id: parsed.workspaceId }, data: { unlockUntil } })
    const traceId = uuidv4()
    await writeAuditLog({ workspaceId: parsed.workspaceId, traceId, actor: approval.approvedBy || approval.requestedBy, action: 'WORKSPACE_UNLOCKED', tool: 'approval', approvalId: approval.id, request: { workspaceId: parsed.workspaceId, unlockUntil: parsed.unlockUntil }, response: { unlockUntil: updatedWorkspace.unlockUntil?.toISOString() || null, appliedByApproval: true } })
    return updatedWorkspace
  })
}

export { fastify, prisma }
