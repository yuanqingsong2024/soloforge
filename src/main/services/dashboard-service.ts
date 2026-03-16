import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type DashboardScope = {
  workspaceId?: string
}

type ActivityFilters = {
  severity?: string
  sourceType?: string
}

type HealthLabel = 'GOOD' | 'WARNING' | 'CRITICAL'

export interface DashboardOverview {
  workspaceCount: number
  targetTotals: {
    total: number
    healthy: number
    degraded: number
    unreachable: number
  }
  openAlerts: number
  criticalDrift: number
  runningOperations: number
  pendingApprovals: number
  agents: {
    online: number
    offline: number
  }
  availableUpdates: number
}

export interface DashboardIssueAction {
  label: string
  route: string
}

export interface DashboardCriticalIssue {
  id: string
  issueType:
    | 'CRITICAL_ALERT'
    | 'CRITICAL_DRIFT'
    | 'FAILED_UPGRADE'
    | 'FAILED_REMEDIATION'
    | 'OFFLINE_AGENT'
    | 'UNREACHABLE_TARGET'
  severity: 'CRITICAL' | 'HIGH'
  workspaceId: string
  workspaceName: string
  targetId?: string
  targetName?: string
  summary: string
  lastOccurredAt: string
  actions: DashboardIssueAction[]
  sortScore: number
}

export interface DashboardRuntimeSnapshot {
  operations: {
    running: number
    waitingApproval: number
    todaySucceeded: number
    todayFailed: number
    last24hSucceeded: number
    last24hFailed: number
    last7dSucceeded: number
    last7dFailed: number
    recent: Array<{
      id: string
      title: string
      type: string
      status: string
      updatedAt: string
    }>
  }
  hostAgents: {
    online: number
    degraded: number
    offline: number
    recentHeartbeatAnomalies: number
    recentAnomalies: Array<{
      id: string
      name: string
      status: string
      lastHeartbeatAt?: string | null
    }>
  }
  deployments: {
    healthy: number
    degraded: number
    unreachable: number
    recentJobs: Array<{
      id: string
      targetId: string
      targetName: string
      type: string
      status: string
      createdAt: string
    }>
  }
  remediation: {
    todayTotal: number
    blocked: number
    failed: number
    succeeded: number
    running: number
    recent: Array<{
      id: string
      title: string
      status: string
      updatedAt: string
    }>
  }
  trends: {
    criticalEvents24h: number
    criticalEvents7d: number
  }
}

export interface DashboardPendingAction {
  id: string
  actionType:
    | 'PENDING_APPROVAL'
    | 'PENDING_CHANGE_REQUEST'
    | 'PENDING_UPGRADE_PLAN'
    | 'PENDING_RECONCILE_PLAN'
    | 'MANUAL_REMEDIATION'
  workspaceId: string
  workspaceName: string
  title: string
  summary: string
  status: string
  createdAt: string
  route: string
}

export interface DashboardActivityItem {
  id: string
  workspaceId: string
  workspaceName: string
  targetId?: string
  targetName?: string
  sourceType: string
  eventType: string
  severity: string
  title: string
  summary: string
  traceId?: string | null
  createdAt: string
}

export interface DashboardHealthScore {
  score: number
  label: HealthLabel
  summary: string
  factors: Array<{
    key: string
    label: string
    weight: number
    penalty: number
    description: string
  }>
}

export interface DashboardPayload {
  generatedAt: string
  scope: {
    workspaceId?: string
    workspaceName?: string
    mode: 'global' | 'workspace'
  }
  overview: DashboardOverview
  criticalIssues: DashboardCriticalIssue[]
  runtime: DashboardRuntimeSnapshot
  pendingActions: DashboardPendingAction[]
  activityPreview: DashboardActivityItem[]
  healthScore: DashboardHealthScore
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function getScopeWhere(scope: DashboardScope): { workspaceId?: string } {
  return scope.workspaceId ? { workspaceId: scope.workspaceId } : {}
}

function getHealthLabel(score: number): HealthLabel {
  if (score >= 80) return 'GOOD'
  if (score >= 55) return 'WARNING'
  return 'CRITICAL'
}

function clampScore(score: number): number {
  if (score < 0) return 0
  if (score > 100) return 100
  return Math.round(score)
}

function compareVersions(currentVersion: string, nextVersion: string): boolean {
  if (currentVersion === nextVersion) return false

  const current = currentVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  const next = nextVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!current || !next) {
    return true
  }

  for (let index = 1; index <= 3; index += 1) {
    const currentPart = Number(current[index])
    const nextPart = Number(next[index])
    if (nextPart > currentPart) return true
    if (nextPart < currentPart) return false
  }

  return false
}

async function resolveWorkspaceName(workspaceId?: string): Promise<string | undefined> {
  if (!workspaceId) return undefined
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true }
  })
  return workspace?.name
}

async function loadWorkspaceNameMap(scope: DashboardScope): Promise<Map<string, string>> {
  const workspaces = await prisma.workspace.findMany({
    where: scope.workspaceId ? { id: scope.workspaceId } : undefined,
    select: { id: true, name: true }
  })

  return new Map(workspaces.map(workspace => [workspace.id, workspace.name]))
}

async function loadTargetNameMap(scope: DashboardScope): Promise<Map<string, string>> {
  const targets = await prisma.deploymentTarget.findMany({
    where: getScopeWhere(scope),
    select: { id: true, name: true }
  })

  return new Map(targets.map(target => [target.id, target.name]))
}

export class DashboardService {
  static async getGlobalOverview(workspaceId?: string): Promise<DashboardOverview> {
    const scope = getScopeWhere({ workspaceId })

    const [
      workspaceCount,
      targets,
      openAlerts,
      criticalDrift,
      runningOperations,
      pendingApprovals,
      agents,
      installedVersions,
      versionCatalog
    ] = await Promise.all([
      prisma.workspace.count({ where: workspaceId ? { id: workspaceId } : undefined }),
      prisma.deploymentTarget.findMany({ where: scope, select: { id: true, status: true } }),
      prisma.alert.count({ where: { ...scope, status: 'OPEN' } }),
      prisma.snapshotDiff.count({ where: { ...scope, severity: 'HIGH' } }),
      prisma.operation.count({ where: { ...scope, status: 'RUNNING' } }),
      prisma.approval.count({ where: { status: 'PENDING' } }),
      prisma.hostAgent.findMany({ where: scope, select: { status: true } }),
      prisma.installedVersion.findMany({ where: scope, select: { component: true, installedVersion: true, targetId: true } }),
      prisma.versionCatalog.findMany({ where: scope, orderBy: { createdAt: 'desc' }, select: { component: true, version: true } })
    ])

    const latestVersionByComponent = new Map<string, string>()
    for (const row of versionCatalog) {
      if (!latestVersionByComponent.has(row.component)) {
        latestVersionByComponent.set(row.component, row.version)
      }
    }

    const availableUpdates = installedVersions.reduce((count, row) => {
      const latestVersion = latestVersionByComponent.get(row.component)
      if (!latestVersion) return count
      return compareVersions(row.installedVersion, latestVersion) ? count + 1 : count
    }, 0)

    const targetTotals = {
      total: targets.length,
      healthy: targets.filter(target => target.status === 'HEALTHY').length,
      degraded: targets.filter(target => target.status === 'DEGRADED').length,
      unreachable: targets.filter(target => target.status === 'UNREACHABLE').length
    }

    return {
      workspaceCount,
      targetTotals,
      openAlerts,
      criticalDrift,
      runningOperations,
      pendingApprovals,
      agents: {
        online: agents.filter(agent => agent.status === 'ONLINE').length,
        offline: agents.filter(agent => agent.status === 'OFFLINE').length
      },
      availableUpdates
    }
  }

  static async getCriticalIssues(workspaceId?: string, limit = 10): Promise<DashboardCriticalIssue[]> {
    const scope = getScopeWhere({ workspaceId })
    const workspaceNames = await loadWorkspaceNameMap({ workspaceId })

    const [criticalAlerts, criticalDrifts, failedUpgradePlans, failedRemediationOps, offlineAgents, unreachableTargets] = await Promise.all([
      prisma.alert.findMany({
        where: { ...scope, status: 'OPEN', severity: 'CRITICAL' },
        orderBy: { updatedAt: 'desc' },
        take: limit
      }),
      prisma.snapshotDiff.findMany({
        where: { ...scope, severity: 'HIGH' },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.upgradePlan.findMany({
        where: { ...scope, status: 'FAILED' },
        include: { target: true },
        orderBy: { updatedAt: 'desc' },
        take: limit
      }),
      prisma.operation.findMany({
        where: { ...scope, type: 'DOCTOR_FIX', status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: limit
      }),
      prisma.hostAgent.findMany({
        where: {
          ...scope,
          status: 'OFFLINE',
          target: {
            envType: 'PROD'
          }
        },
        include: { target: true },
        orderBy: { updatedAt: 'desc' },
        take: limit
      }),
      prisma.deploymentTarget.findMany({
        where: { ...scope, status: 'UNREACHABLE' },
        orderBy: { updatedAt: 'desc' },
        take: limit
      })
    ])

    const issues: DashboardCriticalIssue[] = [
      ...criticalAlerts.map(alert => ({
        id: alert.id,
        issueType: 'CRITICAL_ALERT' as const,
        severity: 'CRITICAL' as const,
        workspaceId: alert.workspaceId,
        workspaceName: workspaceNames.get(alert.workspaceId) || alert.workspaceId,
        targetId: alert.targetId || undefined,
        summary: alert.summary || alert.title,
        lastOccurredAt: alert.updatedAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/alerts' },
          { label: '进入修复', route: '/operations' }
        ],
        sortScore: 100
      })),
      ...criticalDrifts.map(diff => ({
        id: diff.id,
        issueType: 'CRITICAL_DRIFT' as const,
        severity: 'CRITICAL' as const,
        workspaceId: diff.workspaceId,
        workspaceName: workspaceNames.get(diff.workspaceId) || diff.workspaceId,
        summary: diff.summary,
        lastOccurredAt: diff.createdAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/doctor' },
          { label: '生成计划', route: '/changes' }
        ],
        sortScore: 95
      })),
      ...failedUpgradePlans.map(plan => ({
        id: plan.id,
        issueType: 'FAILED_UPGRADE' as const,
        severity: 'CRITICAL' as const,
        workspaceId: plan.workspaceId,
        workspaceName: workspaceNames.get(plan.workspaceId) || plan.workspaceId,
        targetId: plan.targetId,
        targetName: plan.target.name,
        summary: `${plan.target.name} 升级到 ${plan.targetVersion} 失败`,
        lastOccurredAt: plan.updatedAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/upgrade-plans' },
          { label: '进入修复', route: '/upgrade-runs' }
        ],
        sortScore: 92
      })),
      ...failedRemediationOps.map(operation => ({
        id: operation.id,
        issueType: 'FAILED_REMEDIATION' as const,
        severity: 'HIGH' as const,
        workspaceId: operation.workspaceId,
        workspaceName: workspaceNames.get(operation.workspaceId) || operation.workspaceId,
        targetId: operation.targetId || undefined,
        summary: operation.summary || operation.title || '自动修复链路执行失败',
        lastOccurredAt: operation.updatedAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/operations' },
          { label: '进入修复', route: '/doctor' }
        ],
        sortScore: 88
      })),
      ...offlineAgents.map(agent => ({
        id: agent.id,
        issueType: 'OFFLINE_AGENT' as const,
        severity: 'HIGH' as const,
        workspaceId: agent.workspaceId,
        workspaceName: workspaceNames.get(agent.workspaceId) || agent.workspaceId,
        targetId: agent.targetId || undefined,
        targetName: agent.target?.name || undefined,
        summary: `${agent.name} 已离线${agent.target?.name ? `（${agent.target.name}）` : ''}`,
        lastOccurredAt: agent.updatedAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/host-agents' },
          { label: '进入修复', route: '/agent-actions' }
        ],
        sortScore: 84
      })),
      ...unreachableTargets.map(target => ({
        id: target.id,
        issueType: 'UNREACHABLE_TARGET' as const,
        severity: 'CRITICAL' as const,
        workspaceId: target.workspaceId,
        workspaceName: workspaceNames.get(target.workspaceId) || target.workspaceId,
        targetId: target.id,
        targetName: target.name,
        summary: `${target.name} 当前不可达`,
        lastOccurredAt: target.updatedAt.toISOString(),
        actions: [
          { label: '查看详情', route: '/deployments' },
          { label: '进入修复', route: '/doctor' }
        ],
        sortScore: 97
      }))
    ]

    return issues
      .sort((left, right) => {
        if (right.sortScore !== left.sortScore) {
          return right.sortScore - left.sortScore
        }
        return new Date(right.lastOccurredAt).getTime() - new Date(left.lastOccurredAt).getTime()
      })
      .slice(0, limit)
  }

  static async getRuntimeSnapshot(workspaceId?: string): Promise<DashboardRuntimeSnapshot> {
    const scope = getScopeWhere({ workspaceId })
    const last24h = hoursAgo(24)
    const last7d = daysAgo(7)

    const [operations, hostAgents, targets, deploymentJobs, remediationOps, criticalEvents24h, criticalEvents7d] = await Promise.all([
      prisma.operation.findMany({
        where: scope,
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, title: true, type: true, status: true, updatedAt: true }
      }),
      prisma.hostAgent.findMany({
        where: scope,
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, name: true, status: true, lastHeartbeatAt: true, updatedAt: true }
      }),
      prisma.deploymentTarget.findMany({ where: scope, select: { id: true, status: true, name: true } }),
      prisma.deploymentJob.findMany({
        where: scope,
        include: { target: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6
      }),
      prisma.operation.findMany({
        where: { ...scope, type: 'DOCTOR_FIX' },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { id: true, title: true, status: true, updatedAt: true, createdAt: true }
      }),
      prisma.eventRecord.count({ where: { ...scope, severity: 'CRITICAL', createdAt: { gte: last24h } } }),
      prisma.eventRecord.count({ where: { ...scope, severity: 'CRITICAL', createdAt: { gte: last7d } } })
    ])

    const allOperationStats = await prisma.operation.findMany({
      where: scope,
      select: { status: true, createdAt: true }
    })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    return {
      operations: {
        running: allOperationStats.filter(row => row.status === 'RUNNING').length,
        waitingApproval: allOperationStats.filter(row => row.status === 'WAITING_APPROVAL').length,
        todaySucceeded: allOperationStats.filter(row => row.status === 'SUCCEEDED' && row.createdAt >= todayStart).length,
        todayFailed: allOperationStats.filter(row => row.status === 'FAILED' && row.createdAt >= todayStart).length,
        last24hSucceeded: allOperationStats.filter(row => row.status === 'SUCCEEDED' && row.createdAt >= last24h).length,
        last24hFailed: allOperationStats.filter(row => row.status === 'FAILED' && row.createdAt >= last24h).length,
        last7dSucceeded: allOperationStats.filter(row => row.status === 'SUCCEEDED' && row.createdAt >= last7d).length,
        last7dFailed: allOperationStats.filter(row => row.status === 'FAILED' && row.createdAt >= last7d).length,
        recent: operations.map(operation => ({
          id: operation.id,
          title: operation.title || operation.type,
          type: operation.type,
          status: operation.status,
          updatedAt: operation.updatedAt.toISOString()
        }))
      },
      hostAgents: {
        online: hostAgents.filter(agent => agent.status === 'ONLINE').length,
        degraded: hostAgents.filter(agent => agent.status === 'DEGRADED').length,
        offline: hostAgents.filter(agent => agent.status === 'OFFLINE').length,
        recentHeartbeatAnomalies: hostAgents.filter(agent => agent.status === 'DEGRADED' || agent.status === 'OFFLINE').length,
        recentAnomalies: hostAgents
          .filter(agent => agent.status === 'DEGRADED' || agent.status === 'OFFLINE')
          .map(agent => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            lastHeartbeatAt: agent.lastHeartbeatAt?.toISOString() || null
          }))
      },
      deployments: {
        healthy: targets.filter(target => target.status === 'HEALTHY').length,
        degraded: targets.filter(target => target.status === 'DEGRADED').length,
        unreachable: targets.filter(target => target.status === 'UNREACHABLE').length,
        recentJobs: deploymentJobs.map(job => ({
          id: job.id,
          targetId: job.targetId,
          targetName: job.target.name,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt.toISOString()
        }))
      },
      remediation: {
        todayTotal: remediationOps.filter(operation => operation.createdAt >= todayStart).length,
        blocked: remediationOps.filter(operation => operation.status === 'WAITING_APPROVAL').length,
        failed: remediationOps.filter(operation => operation.status === 'FAILED').length,
        succeeded: remediationOps.filter(operation => operation.status === 'SUCCEEDED').length,
        running: remediationOps.filter(operation => operation.status === 'RUNNING').length,
        recent: remediationOps.map(operation => ({
          id: operation.id,
          title: operation.title || '自动修复任务',
          status: operation.status,
          updatedAt: operation.updatedAt.toISOString()
        }))
      },
      trends: {
        criticalEvents24h,
        criticalEvents7d
      }
    }
  }

  static async getPendingActions(workspaceId?: string): Promise<DashboardPendingAction[]> {
    const scope = getScopeWhere({ workspaceId })
    const workspaceNames = await loadWorkspaceNameMap({ workspaceId })

    const [pendingApprovals, pendingChanges, pendingUpgrades, pendingDrifts, failedRemediation] = await Promise.all([
      prisma.approval.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 8
      }),
      prisma.changeRequest.findMany({
        where: { ...scope, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
        orderBy: { updatedAt: 'desc' },
        take: 8
      }),
      prisma.upgradePlan.findMany({
        where: { ...scope, status: { in: ['DRAFT', 'READY', 'PENDING_APPROVAL', 'APPROVED'] } },
        include: { target: true },
        orderBy: { updatedAt: 'desc' },
        take: 8
      }),
      prisma.snapshotDiff.findMany({
        where: { ...scope, severity: 'HIGH' },
        orderBy: { createdAt: 'desc' },
        take: 8
      }),
      prisma.operation.findMany({
        where: { ...scope, type: 'DOCTOR_FIX', status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 8
      })
    ])

    const items: DashboardPendingAction[] = [
      ...pendingApprovals.map(approval => ({
        id: approval.id,
        actionType: 'PENDING_APPROVAL' as const,
        workspaceId: 'global',
        workspaceName: '审批中心',
        title: `${approval.actionType} 待审批`,
        summary: `请求人：${approval.requestedBy}`,
        status: approval.status,
        createdAt: approval.createdAt.toISOString(),
        route: '/approvals'
      })),
      ...pendingChanges.map(change => ({
        id: change.id,
        actionType: 'PENDING_CHANGE_REQUEST' as const,
        workspaceId: change.workspaceId,
        workspaceName: workspaceNames.get(change.workspaceId) || change.workspaceId,
        title: change.title,
        summary: change.description,
        status: change.status,
        createdAt: change.createdAt.toISOString(),
        route: '/changes'
      })),
      ...pendingUpgrades.map(plan => ({
        id: plan.id,
        actionType: 'PENDING_UPGRADE_PLAN' as const,
        workspaceId: plan.workspaceId,
        workspaceName: workspaceNames.get(plan.workspaceId) || plan.workspaceId,
        title: `${plan.target.name} 升级计划待处理`,
        summary: `${plan.currentVersion} → ${plan.targetVersion}`,
        status: plan.status,
        createdAt: plan.createdAt.toISOString(),
        route: '/upgrade-plans'
      })),
      ...pendingDrifts.map(diff => ({
        id: diff.id,
        actionType: 'PENDING_RECONCILE_PLAN' as const,
        workspaceId: diff.workspaceId,
        workspaceName: workspaceNames.get(diff.workspaceId) || diff.workspaceId,
        title: '高风险 Drift 待收敛',
        summary: diff.summary,
        status: diff.severity,
        createdAt: diff.createdAt.toISOString(),
        route: '/doctor'
      })),
      ...failedRemediation.map(operation => ({
        id: operation.id,
        actionType: 'MANUAL_REMEDIATION' as const,
        workspaceId: operation.workspaceId,
        workspaceName: workspaceNames.get(operation.workspaceId) || operation.workspaceId,
        title: operation.title || '自动修复失败，需要人工介入',
        summary: operation.summary || '请查看 Operation 详情并进入修复链路',
        status: operation.status,
        createdAt: operation.createdAt.toISOString(),
        route: '/operations'
      }))
    ]

    return items
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 12)
  }

  static async getActivityPreview(workspaceId?: string, limit = 8, filters?: ActivityFilters): Promise<DashboardActivityItem[]> {
    const workspaceNames = await loadWorkspaceNameMap({ workspaceId })
    const targetNames = await loadTargetNameMap({ workspaceId })

    const rows = await prisma.eventRecord.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(filters?.severity ? { severity: filters.severity } : {}),
        ...(filters?.sourceType ? { sourceType: filters.sourceType } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    return rows.map(row => ({
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceName: workspaceNames.get(row.workspaceId) || row.workspaceId,
      targetId: row.targetId || undefined,
      targetName: row.targetId ? targetNames.get(row.targetId) : undefined,
      sourceType: row.sourceType,
      eventType: row.eventType,
      severity: row.severity,
      title: row.title,
      summary: row.summary,
      traceId: row.traceId,
      createdAt: row.createdAt.toISOString()
    }))
  }

  static async getDashboardHealthScore(workspaceId?: string): Promise<DashboardHealthScore> {
    const overview = await this.getGlobalOverview(workspaceId)
    const runtime = await this.getRuntimeSnapshot(workspaceId)

    const totalTargets = Math.max(overview.targetTotals.total, 1)
    const totalAgents = Math.max(overview.agents.online + overview.agents.offline, 1)
    const totalOperations = Math.max(runtime.operations.last7dSucceeded + runtime.operations.last7dFailed, 1)
    const totalRemediation = Math.max(runtime.remediation.succeeded + runtime.remediation.failed + runtime.remediation.blocked + runtime.remediation.running, 1)

    const factors = [
      {
        key: 'alerts',
        label: 'Alerts 严重度',
        weight: 18,
        penalty: Math.min(18, overview.openAlerts * 2),
        description: `当前有 ${overview.openAlerts} 个未解决 Alerts。`
      },
      {
        key: 'drift',
        label: 'Drift 风险',
        weight: 16,
        penalty: Math.min(16, overview.criticalDrift * 4),
        description: `当前有 ${overview.criticalDrift} 个高风险 Drift。`
      },
      {
        key: 'targetReachability',
        label: 'Target 可达性',
        weight: 18,
        penalty: Math.round(((overview.targetTotals.unreachable * 1 + overview.targetTotals.degraded * 0.5) / totalTargets) * 18),
        description: `Target 健康 ${overview.targetTotals.healthy}/${overview.targetTotals.total}。`
      },
      {
        key: 'agentAvailability',
        label: 'Host Agent 在线率',
        weight: 12,
        penalty: Math.round((overview.agents.offline / totalAgents) * 12),
        description: `在线 ${overview.agents.online} / 离线 ${overview.agents.offline}。`
      },
      {
        key: 'doctor',
        label: '最近 Doctor 结果',
        weight: 10,
        penalty: runtime.trends.criticalEvents24h > 0 ? 8 : 2,
        description: `最近 24h CRITICAL 事件 ${runtime.trends.criticalEvents24h} 个。`
      },
      {
        key: 'upgradeFailure',
        label: 'Upgrade / Deployment 失败率',
        weight: 14,
        penalty: Math.round((runtime.operations.last7dFailed / totalOperations) * 14),
        description: `最近 7d 成功 ${runtime.operations.last7dSucceeded} / 失败 ${runtime.operations.last7dFailed}。`
      },
      {
        key: 'remediation',
        label: 'Remediation 成功率',
        weight: 12,
        penalty: Math.round(((runtime.remediation.failed + runtime.remediation.blocked) / totalRemediation) * 12),
        description: `自动修复成功 ${runtime.remediation.succeeded} / 失败 ${runtime.remediation.failed} / 阻塞 ${runtime.remediation.blocked}。`
      }
    ]

    const score = clampScore(100 - factors.reduce((sum, factor) => sum + factor.penalty, 0))
    const label = getHealthLabel(score)

    return {
      score,
      label,
      summary:
        label === 'GOOD'
          ? '整体运行态稳定，可继续关注待办与更新。'
          : label === 'WARNING'
            ? '系统存在需要尽快处理的风险项，建议优先清理高风险告警与漂移。'
            : '系统健康度偏低，建议立即处理不可达目标、严重告警与失败链路。',
      factors
    }
  }

  static async getDashboard(input: {
    workspaceId?: string
    activityLimit?: number
    activitySeverity?: string
    activitySourceType?: string
    issueLimit?: number
  }): Promise<DashboardPayload> {
    const workspaceName = await resolveWorkspaceName(input.workspaceId)
    const [overview, criticalIssues, runtime, pendingActions, activityPreview, healthScore] = await Promise.all([
      this.getGlobalOverview(input.workspaceId),
      this.getCriticalIssues(input.workspaceId, input.issueLimit || 10),
      this.getRuntimeSnapshot(input.workspaceId),
      this.getPendingActions(input.workspaceId),
      this.getActivityPreview(input.workspaceId, input.activityLimit || 8, {
        severity: input.activitySeverity,
        sourceType: input.activitySourceType
      }),
      this.getDashboardHealthScore(input.workspaceId)
    ])

    return {
      generatedAt: new Date().toISOString(),
      scope: {
        workspaceId: input.workspaceId,
        workspaceName,
        mode: input.workspaceId ? 'workspace' : 'global'
      },
      overview,
      criticalIssues,
      runtime,
      pendingActions,
      activityPreview,
      healthScore
    }
  }
}
