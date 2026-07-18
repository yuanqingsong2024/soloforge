/**
 * Host Agent / Release & Upgrade Center 路由模块
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { HostAgentService, type AgentCapabilities, type AgentActionType, type AgentHeartbeatInput, type CompleteAgentActionInput } from '../host-agent-service'
import { ReleaseUpgradeService } from '../release-upgrade-service'
import { DashboardService } from '../dashboard-service'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,



  isE2ETestMode,
} from '../api-shared'
import { getTestDashboardResponse } from './infrastructure'

// ==================== 类型定义 ====================

interface CreateVersionCatalogBody {
  workspaceId: string
  component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
  version: string
  releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
  source: string
  metadataJson?: string
  releaseNotesSummary?: string
}

interface CreateUpgradePlanBody {
  workspaceId: string
  targetId: string
  policyId?: string | null
  component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
  targetVersion: string
  releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
}

interface ExecuteUpgradePlanBody {
  actor?: string
  approvalId?: string
}

interface CreateBootstrapTokenBody {
  workspaceId: string
  targetId?: string | null
  expiresInMinutes?: number
}

interface RegisterHostAgentBody {
  bootstrapToken: string
  name: string
  hostname: string
  osType: string
  arch: string
  agentVersion: string
  capabilities: AgentCapabilities
  labels?: Record<string, string>
}

interface CreateHostAgentActionBody {
  workspaceId: string
  targetId: string
  hostAgentId: string
  actionType: AgentActionType
  request: Record<string, unknown>
  timeoutSeconds?: number
  actor?: string
}

interface DetectInstalledVersionBody {
  workspaceId: string
  targetId: string
  actor?: string
}

interface ImportVersionManifestBody {
  workspaceId: string
  items: Array<{
    component: 'OPENCLAW' | 'GATEWAY' | 'DOCKER_IMAGE' | 'RUNNER' | 'CUSTOM'
    version: string
    releaseChannel: 'STABLE' | 'BETA' | 'PINNED' | 'CUSTOM'
    source: string
    metadataJson?: string
    releaseNotesSummary?: string
  }>
}

interface UpsertUpgradePolicyBody {
  id?: string
  workspaceId: string
  name: string
  enabled?: boolean
  targetScopeJson?: string
  releaseChannelScopeJson?: string
  autoDetectUpdates?: boolean
  requireBackup?: boolean
  requireApproval?: boolean
  requireMaintenanceWindow?: boolean
  allowAutoRollback?: boolean
}

interface UpsertMaintenanceWindowBody {
  id?: string
  workspaceId: string
  name: string
  enabled?: boolean
  timezone?: string
  cronOrRule: string
  notes?: string
}

// ==================== 辅助函数 ====================

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

// ==================== 路由注册 ====================

export function registerReleaseRoutes(fastify: FastifyInstance): void {
  // ==================== Host Agent / Remote Runner Center ====================
  fastify.get('/api/host-agents', async (request, reply) => {
    const { workspaceId, targetId, status } = request.query as { workspaceId?: string; targetId?: string; status?: string }
    try {
      return ok(await HostAgentService.listHostAgents({ workspaceId, targetId, status }))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Host Agent 列表失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/host-agents/dashboard', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await HostAgentService.getDashboardStats(workspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Host Agent 仪表盘统计失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/host-agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const agent = await HostAgentService.getHostAgent(id)
      if (!agent) {
        reply.code(404)
        return fail('Host Agent 不存在')
      }
      return ok(agent)
    } catch (error) {
      reply.code(500)
      return fail(`获取 Host Agent 详情失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/host-agents/:id/heartbeats', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit } = request.query as { limit?: string }
    try {
      return ok(await HostAgentService.listAgentHeartbeats(id, limit ? Number.parseInt(limit, 10) : 50))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Host Agent 心跳失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/host-agents/:id/actions', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      return ok(await HostAgentService.listAgentActions({ hostAgentId: id }))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Host Agent 动作失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/agent-actions', async (request, reply) => {
    const { workspaceId, targetId, hostAgentId, actionType, status } = request.query as {
      workspaceId?: string
      targetId?: string
      hostAgentId?: string
      actionType?: string
      status?: string
    }
  
    try {
      return ok(await HostAgentService.listAgentActions({ workspaceId, targetId, hostAgentId, actionType, status }))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Agent Actions 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/agent-actions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
  
    try {
      const row = await prisma.agentAction.findUnique({
        where: { id },
        include: {
          hostAgent: { select: { id: true, name: true } },
          target: { select: { id: true, name: true } },
          logs: { orderBy: { createdAt: 'asc' } }
        }
      })
  
      if (!row) {
        reply.code(404)
        return fail('Agent Action 不存在')
      }
  
      return ok(row)
    } catch (error) {
      reply.code(500)
      return fail(`获取 Agent Action 详情失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/agent-logs', async (request, reply) => {
    const { workspaceId, hostAgentId, actionId } = request.query as { workspaceId?: string; hostAgentId?: string; actionId?: string }
    try {
      return ok(await HostAgentService.listAgentLogs({ workspaceId, hostAgentId, actionId }))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Agent Logs 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/bootstrap-tokens', async (request, reply) => {
    const body = request.body as CreateBootstrapTokenBody
    if (!body.workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      const result = await HostAgentService.createBootstrapRegistration(body)
      return ok({
        registrationId: result.registration.id,
        bootstrapToken: result.bootstrapToken,
        expiresAt: result.expiresAt,
        installCommand: [
          '$env:SOLOFORGE_SERVER_URL="http://<soloForge-host>:13789"',
          `$env:SOLOFORGE_BOOTSTRAP_TOKEN=\"${result.bootstrapToken}\"`,
          `$env:SOLOFORGE_AGENT_NAME=\"soloforge-host-agent\"`,
          'npx tsx src/host-agent/index.ts'
        ].join('; ')
      })
    } catch (error) {
      reply.code(500)
      return fail(`创建 bootstrap token 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/register', async (request, reply) => {
    const body = request.body as RegisterHostAgentBody
    try {
      const result = await HostAgentService.registerAgent({
        ...body,
        lastSeenIp: request.ip
      })
      return ok(result)
    } catch (error) {
      reply.code(401)
      return fail(`Host Agent 注册失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/:id/heartbeat', async (request, reply) => {
    const { id } = request.params as { id: string }
    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      reply.code(401)
      return fail('缺少 Bearer token')
    }
  
    const body = request.body as AgentHeartbeatInput
    try {
      return ok(await HostAgentService.recordHeartbeat(id, token, { ...body, lastSeenIp: request.ip }))
    } catch (error) {
      reply.code(401)
      return fail(`Host Agent 心跳失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/host-agents/:id/pull', async (request, reply) => {
    const { id } = request.params as { id: string }
    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      reply.code(401)
      return fail('缺少 Bearer token')
    }
  
    try {
      return ok(await HostAgentService.pollNextAction(id, token))
    } catch (error) {
      reply.code(401)
      return fail(`拉取动作失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/:id/actions/:actionId/ack', async (request, reply) => {
    const { id, actionId } = request.params as { id: string; actionId: string }
    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      reply.code(401)
      return fail('缺少 Bearer token')
    }
  
    try {
      return ok(await HostAgentService.acknowledgeAction(id, token, actionId))
    } catch (error) {
      reply.code(401)
      return fail(`动作 ACK 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/:id/actions/:actionId/complete', async (request, reply) => {
    const { id, actionId } = request.params as { id: string; actionId: string }
    const token = getBearerToken(request.headers.authorization)
    if (!token) {
      reply.code(401)
      return fail('缺少 Bearer token')
    }
  
    const body = request.body as CompleteAgentActionInput
    try {
      return ok(await HostAgentService.completeAction(id, token, actionId, body))
    } catch (error) {
      reply.code(401)
      return fail(`动作完成回执失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/actions', async (request, reply) => {
    const body = request.body as CreateHostAgentActionBody
    if (!body.workspaceId || !body.targetId || !body.hostAgentId || !body.actionType) {
      reply.code(400)
      return fail('workspaceId/targetId/hostAgentId/actionType 不能为空')
    }
  
    try {
      return ok(await HostAgentService.createAction({
        workspaceId: body.workspaceId,
        targetId: body.targetId,
        hostAgentId: body.hostAgentId,
        actionType: body.actionType,
        request: body.request || {},
        actor: body.actor || 'admin',
        traceId: uuidv4(),
        timeoutSeconds: body.timeoutSeconds
      }))
    } catch (error) {
      reply.code(500)
      return fail(`创建 Agent Action 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/:id/test-action', async (request, reply) => {
    const { id } = request.params as { id: string }
    const hostAgent = await prisma.hostAgent.findUnique({ where: { id } })
    if (!hostAgent || !hostAgent.targetId) {
      reply.code(404)
      return fail('Host Agent 未绑定 target，无法执行测试动作')
    }
  
    try {
      return ok(await HostAgentService.createAction({
        workspaceId: hostAgent.workspaceId,
        targetId: hostAgent.targetId,
        hostAgentId: hostAgent.id,
        actionType: 'VERIFY_HEALTH',
        request: { gatewayUrl: hostAgent.lastSeenIp ? undefined : null },
        actor: 'admin',
        traceId: uuidv4()
      }))
    } catch (error) {
      reply.code(500)
      return fail(`创建测试动作失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/host-agents/:id/revoke', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      return ok(await HostAgentService.revokeAgent(id, 'admin'))
    } catch (error) {
      reply.code(500)
      return fail(`吊销 Host Agent 失败：${toErrorMessage(error)}`)
    }
  })
  
  // ==================== Release & Upgrade Center ====================
  
  fastify.get('/api/version-catalog', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listVersionCatalog(workspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取版本目录失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/version-catalog', async (request, reply) => {
    const body = request.body as CreateVersionCatalogBody
    try {
      if (!body.workspaceId || !body.component || !body.version || !body.releaseChannel || !body.source) {
        reply.code(400)
        return fail('workspaceId/component/version/releaseChannel/source 不能为空')
      }
      return ok(await ReleaseUpgradeService.createCatalogEntry(body))
    } catch (error) {
      reply.code(500)
      return fail(`创建版本目录失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/version-catalog/import', async (request, reply) => {
    const body = request.body as ImportVersionManifestBody
    try {
      if (!body.workspaceId || !Array.isArray(body.items) || body.items.length === 0) {
        reply.code(400)
        return fail('workspaceId 与 items 不能为空')
      }
      return ok(await ReleaseUpgradeService.importCatalogManifest(body.workspaceId, body.items.map(item => ({ ...item, workspaceId: body.workspaceId }))))
    } catch (error) {
      reply.code(500)
      return fail(`导入版本清单失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/installed-versions', async (request, reply) => {
    const { workspaceId, targetId } = request.query as { workspaceId?: string; targetId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listInstalledVersions(workspaceId, targetId))
    } catch (error) {
      reply.code(500)
      return fail(`获取已安装版本失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/installed-versions/detect', async (request, reply) => {
    const body = request.body as DetectInstalledVersionBody
    try {
      if (!body.workspaceId || !body.targetId) {
        reply.code(400)
        return fail('workspaceId 与 targetId 不能为空')
      }
  
      const target = await prisma.deploymentTarget.findFirst({
        where: { id: body.targetId, workspaceId: body.workspaceId }
      })
      if (target) {
        const boundAgent = await prisma.hostAgent.findFirst({
          where: {
            workspaceId: body.workspaceId,
            targetId: body.targetId,
            status: 'ONLINE'
          },
          orderBy: { updatedAt: 'desc' }
        })
  
        if (boundAgent) {
          const action = await HostAgentService.runActionAndWait({
            workspaceId: body.workspaceId,
            targetId: body.targetId,
            hostAgentId: boundAgent.id,
            actionType: 'DETECT_VERSION',
            request: {
              containerName: 'openclaw-gateway',
              gatewayUrl: target.gatewayUrl || `http://127.0.0.1:${target.port || 18789}/health`
            },
            actor: body.actor || 'admin',
            traceId: uuidv4(),
            timeoutSeconds: 30
          }, 30_000)
  
          if (action && action.status === 'SUCCEEDED') {
            const version = await prisma.installedVersion.findFirst({
              where: { workspaceId: body.workspaceId, targetId: body.targetId },
              orderBy: { detectedAt: 'desc' }
            })
            if (version) {
              return ok(version)
            }
          }
        }
      }
  
      return ok(await ReleaseUpgradeService.detectInstalledVersion(body.workspaceId, body.targetId, body.actor || 'admin'))
    } catch (error) {
      reply.code(500)
      return fail(`检测安装版本失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/upgrade-policies', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listPolicies(workspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取升级策略失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/upgrade-policies', async (request, reply) => {
    const body = request.body as UpsertUpgradePolicyBody
    try {
      if (!body.workspaceId || !body.name) {
        reply.code(400)
        return fail('workspaceId 与 name 不能为空')
      }
      return ok(await ReleaseUpgradeService.upsertPolicy(body))
    } catch (error) {
      reply.code(500)
      return fail(`保存升级策略失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/maintenance-windows', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listMaintenanceWindows(workspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取维护窗口失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/maintenance-windows', async (request, reply) => {
    const body = request.body as UpsertMaintenanceWindowBody
    try {
      if (!body.workspaceId || !body.name || !body.cronOrRule) {
        reply.code(400)
        return fail('workspaceId/name/cronOrRule 不能为空')
      }
      return ok(await ReleaseUpgradeService.upsertMaintenanceWindow(body))
    } catch (error) {
      reply.code(500)
      return fail(`保存维护窗口失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/upgrade-plans', async (request, reply) => {
    const { workspaceId, targetId, status, component } = request.query as { workspaceId?: string; targetId?: string; status?: string; component?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listUpgradePlans(workspaceId, targetId, status, component))
    } catch (error) {
      reply.code(500)
      return fail(`获取升级计划失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/upgrade-plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const plan = await ReleaseUpgradeService.getUpgradePlan(id)
      if (!plan) {
        reply.code(404)
        return fail('升级计划不存在')
      }
      return ok(plan)
    } catch (error) {
      reply.code(500)
      return fail(`获取升级计划详情失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/upgrade-plans', async (request, reply) => {
    const body = request.body as CreateUpgradePlanBody
    try {
      if (!body.workspaceId || !body.targetId || !body.component || !body.targetVersion || !body.releaseChannel) {
        reply.code(400)
        return fail('workspaceId/targetId/component/targetVersion/releaseChannel 不能为空')
      }
      return ok(await ReleaseUpgradeService.createUpgradePlan(body, 'admin'))
    } catch (error) {
      reply.code(500)
      return fail(`创建升级计划失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/upgrade-plans/:id/dry-run', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body || {}) as ExecuteUpgradePlanBody
    try {
      return ok(await ReleaseUpgradeService.dryRunPlan(id, body.actor || 'admin'))
    } catch (error) {
      reply.code(500)
      return fail(`执行 Dry Run 失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/upgrade-plans/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body || {}) as ExecuteUpgradePlanBody
    try {
      const result = await ReleaseUpgradeService.executePlan({ planId: id, actor: body.actor || 'admin', approvalId: body.approvalId })
      if (result.status === 'pending_approval') {
        reply.code(202)
      }
      return ok(result)
    } catch (error) {
      reply.code(500)
      return fail(`执行升级失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.post('/api/upgrade-plans/:id/rollback', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body || {}) as ExecuteUpgradePlanBody
    try {
      const result = await ReleaseUpgradeService.rollbackPlan({ planId: id, actor: body.actor || 'admin', approvalId: body.approvalId })
      if (result.status === 'pending_approval') {
        reply.code(202)
      }
      return ok(result)
    } catch (error) {
      reply.code(500)
      return fail(`执行回滚失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/upgrade-runs', async (request, reply) => {
    const { workspaceId, targetId, status, component } = request.query as { workspaceId?: string; targetId?: string; status?: string; component?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.listUpgradeRuns(workspaceId, targetId, status, component))
    } catch (error) {
      reply.code(500)
      return fail(`获取升级运行记录失败：${toErrorMessage(error)}`)
    }
  })
  
  fastify.get('/api/release-upgrade/dashboard', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    if (!workspaceId) {
      reply.code(400)
      return fail('workspaceId 不能为空')
    }
  
    try {
      return ok(await ReleaseUpgradeService.getDashboardStats(workspaceId))
    } catch (error) {
      reply.code(500)
      return fail(`获取升级中心仪表盘统计失败：${toErrorMessage(error)}`)
    }
  })
  
  // 旧版兼容端点：返回简化摘要（供旧 E2E 测试使用）
  fastify.get('/api/dashboard/summary', async (request, reply) => {
    try {
      const query = request.query as { workspaceId?: string }
      const wsId = query.workspaceId || undefined
  
      if (isE2ETestMode()) {
        return getTestDashboardResponse(wsId)
      }
  
      const payload = await DashboardService.getDashboard({ workspaceId: wsId })
  
      // 兼容旧 E2E 测试结构
      const ticketsByStatus: Record<string, number> = {}
      ticketsByStatus['HEALTHY'] = payload.overview.targetTotals.healthy
      ticketsByStatus['DEGRADED'] = payload.overview.targetTotals.degraded
      ticketsByStatus['UNREACHABLE'] = payload.overview.targetTotals.unreachable
  
      const recentApprovals = payload.pendingActions
        .filter(action => action.actionType === 'PENDING_APPROVAL')
        .slice(0, 5)
        .map(action => ({
          id: action.id,
          actionType: action.actionType,
          status: action.status,
          requestedBy: action.summary,
          createdAt: action.createdAt
        }))
  
      const recentAudit = payload.activityPreview.slice(0, 10).map(item => ({
        id: item.id,
        actor: item.sourceType,
        action: item.eventType,
        createdAt: item.createdAt
      }))
  
      return {
        ticketsByStatus,
        recentApprovals,
        recentAudit,
        overview: payload.overview,
        criticalIssues: payload.criticalIssues,
        runtime: payload.runtime,
        pendingActions: payload.pendingActions,
        activityPreview: payload.activityPreview,
        healthScore: payload.healthScore,
        generatedAt: payload.generatedAt,
        scope: payload.scope
      }
    } catch (error) {
      const errMsg = toErrorMessage(error)
      reply.code(500)
      return fail(`Dashboard summary 数据获取失败：${errMsg}`)
    }
  })
  
  fastify.get('/api/dashboard', async (request, reply) => {
    const { workspaceId, activityLimit, activitySeverity, activitySourceType, issueLimit } = request.query as {
      workspaceId?: string
      activityLimit?: string
      activitySeverity?: string
      activitySourceType?: string
      issueLimit?: string
    }
  
    try {
      if (isE2ETestMode()) {
        return ok(getTestDashboardResponse(workspaceId))
      }
  
      return ok(await DashboardService.getDashboard({
        workspaceId: workspaceId || undefined,
        activityLimit: activityLimit ? Number(activityLimit) : undefined,
        activitySeverity,
        activitySourceType,
        issueLimit: issueLimit ? Number(issueLimit) : undefined
      }))
    } catch (error) {
      reply.code(500)
      return fail(`获取 Dashboard 聚合数据失败：${toErrorMessage(error)}`)
    }
  })
  
  
}
