/**
 * Operations 路由模块 - 操作运行时
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import {
  prisma,
  ok,
  fail,
  toErrorMessage,
  emitApiEvent,
  TEST_WORKSPACE_ID,
  TEST_WORKSPACE_NAME
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== 类型定义 ====================

interface CreateOperationBody {
  workspaceId: string
  targetId?: string
  type: 'DEPLOY' | 'UPGRADE' | 'RESTORE' | 'DOCTOR_FIX' | 'SYNC' | 'CUSTOM'
  title?: string
  summary?: string
  phases: Array<{
    name: string
    steps: Array<{
      name: string
      stepType: 'PRECHECK' | 'BACKUP' | 'WRITE_CONFIG' | 'START' | 'STOP' | 'RESTART' | 'VERIFY' | 'CLEANUP' | 'CUSTOM'
      requestJson?: Record<string, unknown>
    }>
  }>
}

interface UpdateOperationStepBody {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
  resultJson?: Record<string, unknown>
  logs?: string
  deploymentJobId?: string
  changeRequestId?: string
  alertId?: string
}

// ==================== 辅助函数 ====================

async function recomputeOperationState(operationId: string): Promise<void> {
  const phases = await prisma.operationPhase.findMany({
    where: { operationId },
    include: { steps: true },
    orderBy: { orderNo: 'asc' }
  })

  let operationStatus: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' = 'PENDING'

  for (const phase of phases) {
    const stepStatuses = phase.steps.map(step => step.status)
    let nextPhaseStatus: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' = 'PENDING'

    if (stepStatuses.some(status => status === 'FAILED')) {
      nextPhaseStatus = 'FAILED'
      operationStatus = 'FAILED'
    } else if (stepStatuses.length > 0 && stepStatuses.every(status => status === 'SUCCEEDED' || status === 'SKIPPED')) {
      nextPhaseStatus = 'SUCCEEDED'
      if (operationStatus !== 'FAILED') {
        operationStatus = 'SUCCEEDED'
      }
    } else if (stepStatuses.some(status => status === 'RUNNING')) {
      nextPhaseStatus = 'RUNNING'
      operationStatus = 'RUNNING'
    }

    await prisma.operationPhase.update({
      where: { id: phase.id },
      data: {
        status: nextPhaseStatus,
        startedAt: nextPhaseStatus === 'RUNNING' && !phase.startedAt ? new Date() : phase.startedAt,
        endedAt: nextPhaseStatus === 'SUCCEEDED' || nextPhaseStatus === 'FAILED' ? new Date() : null
      }
    })
  }

  if (phases.length > 0 && phases.some(phase => phase.steps.some(step => step.status === 'PENDING'))) {
    if (operationStatus === 'SUCCEEDED') {
      operationStatus = 'RUNNING'
    }
  }

  await prisma.operation.update({
    where: { id: operationId },
    data: { status: operationStatus }
  })
}

// ==================== 路由注册 ====================

export function registerOperationsRoutes(fastify: FastifyInstance): void {
  // 获取操作列表
  fastify.get('/api/operations', async (request, reply) => {
    const { workspaceId, targetId, status, type } = request.query as {
      workspaceId?: string
      targetId?: string
      status?: string
      type?: string
    }

    try {
      const rows = await prisma.operation.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(targetId ? { targetId } : {}),
          ...(status ? { status } : {}),
          ...(type ? { type } : {})
        },
        include: {
          phases: {
            include: { steps: true },
            orderBy: { orderNo: 'asc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ok(rows)
    } catch (error) {
      reply.code(500)
      return fail(`获取操作列表失败：${toErrorMessage(error)}`)
    }
  })

  // 获取操作详情
  fastify.get('/api/operations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const row = await prisma.operation.findUnique({
        where: { id },
        include: {
          phases: {
            include: { steps: true },
            orderBy: { orderNo: 'asc' }
          }
        }
      })

      if (!row) {
        reply.code(404)
        return fail('操作不存在')
      }

      return ok(row)
    } catch (error) {
      reply.code(500)
      return fail(`获取操作详情失败：${toErrorMessage(error)}`)
    }
  })

  // 创建操作
  fastify.post('/api/operations', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const body = request.body as CreateOperationBody

    try {
      if (!body.workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!body.type) {
        reply.code(400)
        return fail('type 不能为空')
      }
      if (!Array.isArray(body.phases) || body.phases.length === 0) {
        reply.code(400)
        return fail('phases 不能为空')
      }

      const created = await prisma.operation.create({
        data: {
          workspaceId: body.workspaceId,
          targetId: body.targetId || null,
          type: body.type,
          status: 'PENDING',
          traceId,
          title: body.title || `${body.type} 操作`,
          summary: body.summary || '',
          phases: {
            create: body.phases.map((phase, phaseIndex) => ({
              name: phase.name,
              orderNo: phaseIndex + 1,
              status: 'PENDING',
              steps: {
                create: phase.steps.map(step => ({
                  name: step.name,
                  stepType: step.stepType,
                  status: 'PENDING',
                  requestJson: JSON.stringify(step.requestJson || {})
                }))
              }
            }))
          }
        },
        include: {
          phases: {
            include: { steps: true },
            orderBy: { orderNo: 'asc' }
          }
        }
      })

      await writeAuditLog({
        workspaceId: body.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_CREATED',
        tool: 'operations',
        request: {
          workspaceId: body.workspaceId,
          targetId: body.targetId || null,
          type: body.type,
          title: body.title || null
          },
        response: { operationId: created.id }
      })

      await emitApiEvent({
        workspaceId: body.workspaceId,
        targetId: body.targetId,
        sourceType: 'SYSTEM',
        sourceId: created.id,
        eventType: 'OPERATION_CREATED',
        severity: 'INFO',
        title: created.title || '操作已创建',
        summary: created.summary || `${body.type} 操作已建立阶段结构`,
        payload: {
          operationId: created.id,
          phaseCount: created.phases.length,
          type: created.type
        },
        traceId
      })

      return ok(created)
    } catch (error) {
      reply.code(500)
      return fail(`创建操作失败：${toErrorMessage(error)}`)
    }
  })

  // 启动操作
  fastify.post('/api/operations/:id/start', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }

    try {
      const existing = await prisma.operation.findUnique({
        where: { id },
        include: { phases: { include: { steps: true }, orderBy: { orderNo: 'asc' } } }
      })
      if (!existing) {
        reply.code(404)
        return fail('操作不存在')
      }

      await prisma.operation.update({
        where: { id },
        data: { status: 'RUNNING' }
      })

      const firstPhase = existing.phases[0]
      if (firstPhase) {
        await prisma.operationPhase.update({
          where: { id: firstPhase.id },
          data: { status: 'RUNNING', startedAt: new Date() }
        })
      }

      await writeAuditLog({
        workspaceId: existing.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_STARTED',
        tool: 'operations',
        request: { operationId: id },
        response: { status: 'RUNNING' }
      })

      await emitApiEvent({
        workspaceId: existing.workspaceId,
        targetId: existing.targetId || undefined,
        sourceType: 'SYSTEM',
        sourceId: existing.id,
        eventType: 'OPERATION_STARTED',
        severity: 'INFO',
        title: '操作已启动',
        summary: `${existing.title || existing.type} 已进入执行态`,
        payload: { operationId: existing.id },
        traceId
      })

      return ok({ status: 'RUNNING' })
    } catch (error) {
      reply.code(500)
      return fail(`启动操作失败：${toErrorMessage(error)}`)
    }
  })

  // 更新操作步骤
  fastify.post('/api/operation-steps/:id/update', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
    const body = request.body as UpdateOperationStepBody

    try {
      const step = await prisma.operationStep.findUnique({
        where: { id },
        include: { phase: { include: { operation: true } } }
      })
      if (!step) {
        reply.code(404)
        return fail('操作步骤不存在')
      }

      await prisma.operationStep.update({
        where: { id },
        data: {
          status: body.status,
          resultJson: body.resultJson ? JSON.stringify(body.resultJson) : undefined,
          logs: body.logs,
          deploymentJobId: body.deploymentJobId,
          changeRequestId: body.changeRequestId,
          alertId: body.alertId,
          startedAt: body.status === 'RUNNING' && !step.startedAt ? new Date() : step.startedAt,
          endedAt: body.status === 'SUCCEEDED' || body.status === 'FAILED' || body.status === 'SKIPPED' ? new Date() : null
        }
      })

      await recomputeOperationState(step.phase.operation.id)

      await writeAuditLog({
        workspaceId: step.phase.operation.workspaceId,
        traceId,
        actor,
        action: 'OPERATION_STEP_UPDATED',
        tool: 'operations',
        request: { operationStepId: id, status: body.status },
        response: { operationId: step.phase.operation.id }
      })

      await emitApiEvent({
        workspaceId: step.phase.operation.workspaceId,
        targetId: step.phase.operation.targetId || undefined,
        sourceType: 'SYSTEM',
        sourceId: step.phase.operation.id,
        eventType: body.status === 'FAILED' ? 'OPERATION_STEP_FAILED' : 'OPERATION_STEP_UPDATED',
        severity: body.status === 'FAILED' ? 'ERROR' : body.status === 'RUNNING' ? 'WARN' : 'INFO',
        title: `步骤状态更新：${step.name}`,
        summary: `${step.name} → ${body.status}`,
        payload: {
          operationId: step.phase.operation.id,
          stepId: step.id,
          status: body.status,
          deploymentJobId: body.deploymentJobId,
          changeRequestId: body.changeRequestId,
          alertId: body.alertId
        },
        traceId
      })

      return ok({ updated: true })
    } catch (error) {
      reply.code(500)
      return fail(`更新操作步骤失败：${toErrorMessage(error)}`)
    }
  })

  // ===== Dashboard 测试场景端点 =====
  fastify.get('/api/dashboard/test-scenario', async (request, _reply) => {
    const _workspaceId = request.query as { workspaceId?: string }
    const scenarioId = process.env.SOLOFORGE_E2E_DASHBOARD_SCENARIO || 'default'
    return ok(getTestDashboardResponse(_workspaceId.workspaceId, scenarioId))
  })
}

// ==================== 测试 Dashboard 场景 ====================

interface TestDashboardScenario {
  id: string
  label: string
  payload: { overview: Record<string, unknown>; [key: string]: unknown }
}

function getTestDashboardResponse(_workspaceId?: string, scenarioId?: string): TestDashboardScenario['payload'] {
  const nowIso = new Date('2026-03-15T10:00:00.000+08:00').toISOString()

  const baseScenario: TestDashboardScenario = {
    id: 'default',
    label: '默认 Dashboard 场景',
    payload: {
      generatedAt: nowIso,
      scope: {
        workspaceId: TEST_WORKSPACE_ID,
        workspaceName: TEST_WORKSPACE_NAME,
        mode: 'workspace'
      },
      overview: {
        workspaceCount: 2,
        targetTotals: {
          total: 6,
          healthy: 3,
          degraded: 2,
          unreachable: 1
        },
        openAlerts: 3,
        criticalDrift: 2,
        runningOperations: 1,
        pendingApprovals: 2,
        agents: {
          online: 3,
          offline: 1
        },
        availableUpdates: 2
      },
      criticalIssues: [
        {
          id: 'issue-offline-agent',
          issueType: 'OFFLINE_AGENT',
          severity: 'CRITICAL',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-agent-1',
          targetName: 'edge-host-01',
          summary: 'Host Agent 已离线，需要人工排查。',
          lastOccurredAt: nowIso,
          actions: [{ label: '查看 Agent', route: '/host-agents' }]
        },
        {
          id: 'issue-alert',
          issueType: 'CRITICAL_ALERT',
          severity: 'HIGH',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-alert-1',
          targetName: 'gateway-prod',
          summary: '存在未确认的关键告警。',
          lastOccurredAt: nowIso,
          actions: [{ label: '查看 Alerts', route: '/alerts' }]
        }
      ],
      runtime: {
        operations: {
          running: 1,
          waitingApproval: 2,
          todaySucceeded: 5,
          todayFailed: 1,
          last24hSucceeded: 5,
          last24hFailed: 1,
          last7dSucceeded: 18,
          last7dFailed: 2,
          recent: [{ id: 'op-1', title: '同步实际状态', type: 'SYNC', status: 'RUNNING', updatedAt: nowIso }]
        },
        hostAgents: {
          online: 3,
          degraded: 0,
          offline: 1,
          recentHeartbeatAnomalies: 1,
          recentAnomalies: [{ id: 'agent-1', name: 'edge-host-01', status: 'OFFLINE', lastHeartbeatAt: nowIso }]
        },
        deployments: {
          healthy: 3,
          degraded: 2,
          unreachable: 1,
          recentJobs: [{ id: 'deploy-1', targetId: 'target-1', targetName: 'gateway-prod', type: 'RESTART', status: 'FAILED', createdAt: nowIso }]
        },
        remediation: {
          todayTotal: 4,
          blocked: 1,
          failed: 1,
          succeeded: 2,
          running: 0,
          recent: [{ id: 'remediation-1', title: '恢复 host-agent 连接', status: 'FAILED', updatedAt: nowIso }]
        },
        trends: {
          criticalEvents24h: 2,
          criticalEvents7d: 5
        }
      },
      pendingActions: [
        {
          id: 'pending-approval-1',
          actionType: 'PENDING_APPROVAL',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待审批配置变更',
          summary: '需要人工确认后继续执行。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/approvals'
        },
        {
          id: 'pending-change-1',
          actionType: 'PENDING_CHANGE_REQUEST',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待处理变更单',
          summary: '存在待收敛的 Drift 变更。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/changes'
        },
        {
          id: 'pending-upgrade-1',
          actionType: 'PENDING_UPGRADE_PLAN',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          title: '待处理升级计划',
          summary: '有可执行升级，等待确认。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/upgrade-plans'
        }
      ],
      activityPreview: [
        {
          id: 'activity-1',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          targetId: 'target-1',
          targetName: 'gateway-prod',
          sourceType: 'SYSTEM',
          eventType: 'TARGET_UNREACHABLE',
          severity: 'CRITICAL',
          title: '目标不可达',
          summary: '监测到 gateway-prod 不可达。',
          traceId: 'trace-activity-1',
          createdAt: nowIso
        },
        {
          id: 'activity-2',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          sourceType: 'HOST_AGENT',
          eventType: 'HEARTBEAT_MISSED',
          severity: 'WARN',
          title: 'Host Agent 心跳异常',
          summary: 'edge-host-01 在阈值内未上报心跳。',
          traceId: 'trace-activity-2',
          createdAt: nowIso
        }
      ],
      healthScore: {
        score: 68,
        label: 'WARNING',
        summary: '存在离线 Agent 与未处理风险项。',
        factors: [
          { key: 'alerts', label: 'Alerts 严重度', weight: 30, penalty: 12, description: '存在高优先级风险告警。' },
          { key: 'agents', label: 'Host Agent 在线率', weight: 20, penalty: 8, description: '1 个 Agent 离线。' }
        ]
      }
    }
  }

  if (scenarioId === 'workspace-secondary') {
    return {
      ...baseScenario.payload,
      scope: {
        workspaceId: '00000000-0000-0000-0000-000000000002',
        workspaceName: 'Remote Workspace',
        mode: 'workspace'
      },
      overview: {
        ...baseScenario.payload.overview,
        targetTotals: { total: 2, healthy: 2, degraded: 0, unreachable: 0 },
        openAlerts: 1,
        criticalDrift: 0,
        pendingApprovals: 1,
        agents: { online: 2, offline: 0 },
        availableUpdates: 1
      },
      criticalIssues: [
        {
          id: 'issue-secondary-alert',
          issueType: 'CRITICAL_ALERT',
          severity: 'HIGH',
          workspaceId: '00000000-0000-0000-0000-000000000002',
          workspaceName: 'Remote Workspace',
          targetId: 'target-remote-1',
          targetName: 'remote-runner',
          summary: 'Remote Workspace 存在待处理 Alert。',
          lastOccurredAt: nowIso,
          actions: [{ label: '查看 Alerts', route: '/alerts' }]
        }
      ],
      pendingActions: [
        {
          id: 'pending-secondary-approval',
          actionType: 'PENDING_APPROVAL',
          workspaceId: '00000000-0000-0000-0000-000000000002',
          workspaceName: 'Remote Workspace',
          title: 'Remote Workspace 审批项',
          summary: '切换后上下文应更新为新 Workspace。',
          status: 'PENDING',
          createdAt: nowIso,
          route: '/approvals'
        }
      ],
      activityPreview: [
        {
          id: 'activity-secondary-1',
          workspaceId: '00000000-0000-0000-0000-000000000002',
          workspaceName: 'Remote Workspace',
          sourceType: 'SYSTEM',
          eventType: 'REMOTE_SYNC_OK',
          severity: 'INFO',
          title: 'Remote Workspace 同步成功',
          summary: '远程工作区数据已刷新。',
          traceId: 'trace-secondary-1',
          createdAt: nowIso
        }
      ],
      healthScore: {
        score: 84,
        label: 'GOOD',
        summary: 'Remote Workspace 整体状态良好。',
        factors: [{ key: 'agents', label: 'Host Agent 在线率', weight: 20, penalty: 0, description: '所有 Agent 均在线。' }]
      }
    }
  }

  if (scenarioId === 'empty-state') {
    return {
      ...baseScenario.payload,
      overview: {
        ...baseScenario.payload.overview,
        openAlerts: 0,
        criticalDrift: 0,
        pendingApprovals: 0
      },
      criticalIssues: [],
      pendingActions: [],
      activityPreview: [
        {
          id: 'activity-empty-1',
          workspaceId: TEST_WORKSPACE_ID,
          workspaceName: TEST_WORKSPACE_NAME,
          sourceType: 'SYSTEM',
          eventType: 'DASHBOARD_IDLE',
          severity: 'INFO',
          title: '当前无待处理风险',
          summary: 'Dashboard 处于空状态展示。',
          traceId: 'trace-empty-1',
          createdAt: nowIso
        }
      ],
      healthScore: {
        score: 96,
        label: 'GOOD',
        summary: '当前无关键风险项。',
        factors: [{ key: 'alerts', label: 'Alerts 严重度', weight: 30, penalty: 0, description: '无未解决风险告警。' }]
      }
    }
  }

  return baseScenario.payload
}
