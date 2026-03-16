import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { Drawer } from '../components/ui/Drawer'

interface WorkspaceOption {
  id: string
  name: string
  envType: string
}

interface DashboardOverview {
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

interface DashboardHealthScore {
  score: number
  label: 'GOOD' | 'WARNING' | 'CRITICAL'
  summary: string
  factors: Array<{
    key: string
    label: string
    weight: number
    penalty: number
    description: string
  }>
}

interface DashboardCriticalIssue {
  id: string
  issueType: 'CRITICAL_ALERT' | 'CRITICAL_DRIFT' | 'FAILED_UPGRADE' | 'FAILED_REMEDIATION' | 'OFFLINE_AGENT' | 'UNREACHABLE_TARGET'
  severity: 'CRITICAL' | 'HIGH'
  workspaceId: string
  workspaceName: string
  targetId?: string
  targetName?: string
  summary: string
  lastOccurredAt: string
  actions: Array<{
    label: string
    route: string
  }>
}

interface DashboardRuntimeSnapshot {
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

interface DashboardPendingAction {
  id: string
  actionType: 'PENDING_APPROVAL' | 'PENDING_CHANGE_REQUEST' | 'PENDING_UPGRADE_PLAN' | 'PENDING_RECONCILE_PLAN' | 'MANUAL_REMEDIATION'
  workspaceId: string
  workspaceName: string
  title: string
  summary: string
  status: string
  createdAt: string
  route: string
}

interface DashboardActivityItem {
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

interface DashboardPayload {
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

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-100 text-rose-800 border-rose-300'
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'FAILED':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'OFFLINE':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200'
  }
}

function getHealthScoreClass(label: DashboardHealthScore['label']): string {
  switch (label) {
    case 'GOOD':
      return 'text-emerald-600'
    case 'WARNING':
      return 'text-amber-600'
    case 'CRITICAL':
      return 'text-rose-600'
  }
}

function getStatusLabel(label: DashboardHealthScore['label']): string {
  switch (label) {
    case 'GOOD':
      return 'Good'
    case 'WARNING':
      return 'Warning'
    case 'CRITICAL':
      return 'Critical'
  }
}

function buildOverviewCards(overview: DashboardOverview): Array<{
  key: string
  title: string
  value: string
  subtitle: string
  route: string
}> {
  return [
    {
      key: 'workspaces',
      title: 'Workspaces',
      value: String(overview.workspaceCount),
      subtitle: '当前纳管工作区数',
      route: '/workspace-settings'
    },
    {
      key: 'targets',
      title: 'Targets',
      value: String(overview.targetTotals.total),
      subtitle: `Healthy ${overview.targetTotals.healthy} / Degraded ${overview.targetTotals.degraded} / Unreachable ${overview.targetTotals.unreachable}`,
      route: '/deployments'
    },
    {
      key: 'alerts',
      title: 'Open Alerts',
      value: String(overview.openAlerts),
      subtitle: '未解决风险告警',
      route: '/alerts'
    },
    {
      key: 'drift',
      title: 'Critical Drift',
      value: String(overview.criticalDrift),
      subtitle: '高风险配置漂移',
      route: '/doctor'
    },
    {
      key: 'operations',
      title: 'Running Operations',
      value: String(overview.runningOperations),
      subtitle: '关键动作执行中',
      route: '/operations'
    },
    {
      key: 'approvals',
      title: 'Pending Approvals',
      value: String(overview.pendingApprovals),
      subtitle: '人工手刹待处理',
      route: '/approvals'
    },
    {
      key: 'agents',
      title: 'Agents',
      value: `${overview.agents.online}/${overview.agents.offline}`,
      subtitle: 'Online / Offline',
      route: '/host-agents'
    },
    {
      key: 'updates',
      title: 'Available Updates',
      value: String(overview.availableUpdates),
      subtitle: '可处理升级项',
      route: '/releases'
    }
  ]
}

export function Dashboard() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [activitySeverity, setActivitySeverity] = useState('')
  const [activitySourceType, setActivitySourceType] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'global' | 'workspace'>(() => {
    const stored = localStorage.getItem('soloforge-dashboard-mode')
    return stored === 'global' ? 'global' : 'workspace'
  })
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => {
    return localStorage.getItem('soloforge-current-workspace') || DEFAULT_WORKSPACE_ID
  })

  // Drawer 状态管理
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const effectiveWorkspaceId = workspaceMode === 'workspace' ? selectedWorkspaceId : undefined
  const overviewCards = useMemo(() => (dashboard ? buildOverviewCards(dashboard.overview) : []), [dashboard])

  const fetchWorkspaces = useCallback(async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/workspaces`)
    const data = await response.json() as WorkspaceOption[]
    setWorkspaces(Array.isArray(data) ? data : [])
  }, [])

  const fetchDashboard = useCallback(async (port: number, options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setError(null)
      setStatusMessage(null)
    }

    const params = new URLSearchParams()
    if (effectiveWorkspaceId) {
      params.set('workspaceId', effectiveWorkspaceId)
    }
    if (activitySeverity) {
      params.set('activitySeverity', activitySeverity)
    }
    if (activitySourceType) {
      params.set('activitySourceType', activitySourceType)
    }
    params.set('activityLimit', '8')
    params.set('issueLimit', '10')

    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard?${params.toString()}`)
    const json = await response.json() as ApiResponse<DashboardPayload>
    if (!json.success) {
      throw new Error(json.error)
    }

    setDashboard(json.data)
  }, [activitySeverity, activitySourceType, effectiveWorkspaceId])

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      try {
        await Promise.all([fetchWorkspaces(port), fetchDashboard(port)])
      } catch (currentError) {
        setError(currentError instanceof Error ? currentError.message : String(currentError))
      } finally {
        setLoading(false)
      }
    })
  }, [fetchDashboard, fetchWorkspaces])

  useEffect(() => {
    if (!apiPort || !autoRefreshEnabled) return
    const timer = window.setInterval(() => {
      void fetchDashboard(apiPort, { silent: true }).catch(currentError => {
        setStatusMessage(`自动刷新失败：${currentError instanceof Error ? currentError.message : String(currentError)}`)
      })
    }, 30000)

    return () => window.clearInterval(timer)
  }, [apiPort, autoRefreshEnabled, fetchDashboard])

  useEffect(() => {
    localStorage.setItem('soloforge-dashboard-mode', workspaceMode)
  }, [workspaceMode])

  const refreshAll = async () => {
    if (!apiPort) return
    setRefreshing(true)
    setStatusMessage(null)
    try {
      await Promise.all([fetchWorkspaces(apiPort), fetchDashboard(apiPort)])
      setStatusMessage(`已刷新 Dashboard · ${new Date().toLocaleTimeString('zh-CN')}`)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : String(currentError))
    } finally {
      setRefreshing(false)
    }
  }

  const switchWorkspace = async (nextMode: 'global' | 'workspace', nextWorkspaceId?: string) => {
    const resolvedWorkspaceId = nextWorkspaceId || selectedWorkspaceId
    setWorkspaceMode(nextMode)
    if (nextWorkspaceId) {
      setSelectedWorkspaceId(nextWorkspaceId)
      localStorage.setItem('soloforge-current-workspace', nextWorkspaceId)
    }
    if (!apiPort) return
    setRefreshing(true)
    setStatusMessage(null)
    try {
      const params = new URLSearchParams()
      if (nextMode === 'workspace') {
        params.set('workspaceId', resolvedWorkspaceId)
      }
      if (activitySeverity) {
        params.set('activitySeverity', activitySeverity)
      }
      if (activitySourceType) {
        params.set('activitySourceType', activitySourceType)
      }
      params.set('activityLimit', '8')
      params.set('issueLimit', '10')

      const response = await fetch(`http://127.0.0.1:${apiPort}/api/dashboard?${params.toString()}`)
      const json = await response.json() as ApiResponse<DashboardPayload>
      if (!json.success) {
        throw new Error(json.error)
      }
      setDashboard(json.data)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : String(currentError))
    } finally {
      setRefreshing(false)
    }
  }

  const runDoctorCheck = async () => {
    if (!apiPort || !selectedWorkspaceId) return
    setStatusMessage('正在发起 Doctor Check...')
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/doctor/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: selectedWorkspaceId, createdBy: 'admin' })
      })
      const json = await response.json() as ApiResponse<unknown>
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage('Doctor Check 已触发，正在跳转诊断中心。')
      navigate('/doctor')
    } catch (currentError) {
      setStatusMessage(`Doctor Check 触发失败：${currentError instanceof Error ? currentError.message : String(currentError)}`)
    }
  }

  const syncActual = async () => {
    if (!apiPort || !selectedWorkspaceId) return
    setStatusMessage('正在同步 Actual Snapshot...')
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/snapshots/actual`, {
        method: 'POST'
      })
      const json = await response.json() as ApiResponse<unknown>
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage('Actual Snapshot 已同步。')
      await refreshAll()
    } catch (currentError) {
      setStatusMessage(`同步 Actual 失败：${currentError instanceof Error ? currentError.message : String(currentError)}`)
    }
  }

  const createReconcilePlan = async () => {
    if (!apiPort || !selectedWorkspaceId) return
    setStatusMessage('正在计算 Drift 并生成 Reconcile 入口...')
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/drift/compute`, {
        method: 'POST'
      })
      const json = await response.json() as ApiResponse<unknown>
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage('Drift 已重新计算，请在诊断中心生成变更计划。')
      navigate('/doctor')
    } catch (currentError) {
      setStatusMessage(`生成 Reconcile 入口失败：${currentError instanceof Error ? currentError.message : String(currentError)}`)
    }
  }

  const quickActions: Array<{
    label: string
    description: string
    onClick: () => void
    disabled?: boolean
  }> = [
    {
      label: 'Sync Actual',
      description: '同步实际状态快照',
      onClick: () => { void syncActual() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: 'Run Doctor Check',
      description: '发起当前工作区诊断',
      onClick: () => { void runDoctorCheck() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: 'Create Reconcile Plan',
      description: '重算 Drift 并进入收敛链路',
      onClick: () => { void createReconcilePlan() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: 'Open Pending Approvals',
      description: '查看待审批事项',
      onClick: () => navigate('/approvals')
    },
    {
      label: 'View Offline Agents',
      description: '查看离线 Agent',
      onClick: () => navigate('/host-agents')
    },
    {
      label: 'View Failed Upgrades',
      description: '查看失败升级',
      onClick: () => navigate('/upgrade-plans')
    },
    {
      label: 'New Deployment Target',
      description: '进入新建部署目标',
      onClick: () => navigate('/deployments/new')
    },
    {
      label: 'Bootstrap Host Agent',
      description: '进入 Agent 引导向导',
      onClick: () => navigate('/host-agents/new')
    }
  ]

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <PageHeader
        title="总控首页"
        description="统一查看 Workspace、Target、Alerts、Drift、Approvals、Operations、Host Agents、Upgrade 与 Activity Feed 的当前运行态。"
        actions={
          <>
            <button
              data-testid="dashboard-refresh-button"
              onClick={() => void refreshAll()}
              className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
              type="button"
            >
              {refreshing ? '刷新中…' : '手动刷新'}
            </button>
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input
                data-testid="dashboard-auto-refresh-toggle"
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
              />
              30s 自动刷新
            </label>
          </>
        }
      />

      {(error || statusMessage) && (
        <div className="space-y-2">
          {error && (
            <div data-testid="dashboard-error-banner" className="p-3 rounded-workshop-md border border-red-200 bg-red-50 text-sm text-red-800">
              Dashboard 加载失败：{error}
            </div>
          )}
          {statusMessage && (
            <div data-testid="dashboard-status-banner" className="p-3 rounded-workshop-md border border-blue-200 bg-blue-50 text-sm text-blue-800">
              {statusMessage}
            </div>
          )}
        </div>
      )}

      <SectionCard title="Global Overview" description="总控首页支持全局模式与当前 Workspace 模式，切换后所有板块同步过滤。">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)] gap-6">
          <div data-testid="dashboard-global-overview" className="space-y-4">
            <div data-testid="dashboard-workspace-controls" className="flex flex-wrap items-center gap-3">
              <button
                data-testid="dashboard-workspace-mode-global"
                type="button"
                onClick={() => void switchWorkspace('global')}
                className={`px-3 py-2 rounded-workshop-md text-sm border ${workspaceMode === 'global' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))]'}`}
              >
                全局模式
              </button>
              <button
                data-testid="dashboard-workspace-mode-current"
                type="button"
                onClick={() => void switchWorkspace('workspace')}
                className={`px-3 py-2 rounded-workshop-md text-sm border ${workspaceMode === 'workspace' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))]'}`}
              >
                当前 Workspace
              </button>
              <select
                data-testid="dashboard-workspace-switcher"
                value={selectedWorkspaceId}
                onChange={(event) => void switchWorkspace('workspace', event.target.value)}
                className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              >
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.envType}
                  </option>
                ))}
              </select>
            </div>

            <div data-testid="dashboard-overview-cards" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {overviewCards.map(card => (
                <Link key={card.key} to={card.route} data-testid={`dashboard-overview-card-${card.key}`} className="block">
                  <SectionCard className="!p-0 hover:border-[hsl(var(--primary))] transition-colors h-full">
                    <div className="px-5 py-4 space-y-2">
                      <div className="text-sm text-[hsl(var(--muted-foreground))]">{card.title}</div>
                      <div className="text-3xl font-bold text-[hsl(var(--foreground))]">{card.value}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{card.subtitle}</div>
                    </div>
                  </SectionCard>
                </Link>
              ))}
            </div>
          </div>

          <div data-testid="dashboard-health-score" className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--background))] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">Dashboard Health Score</div>
                <div className={`text-4xl font-bold ${dashboard ? getHealthScoreClass(dashboard.healthScore.label) : ''}`}>
                  {dashboard?.healthScore.score ?? 0}
                </div>
                <div className="text-sm font-medium text-[hsl(var(--foreground))] mt-1">
                  {dashboard ? getStatusLabel(dashboard.healthScore.label) : '—'}
                </div>
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] max-w-[180px]">
                {dashboard?.healthScore.summary}
              </div>
            </div>
            <div className="space-y-2">
              {dashboard?.healthScore.factors.map(factor => (
                <div key={factor.key} className="text-xs text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded-workshop-sm p-2">
                  <div className="font-medium text-[hsl(var(--foreground))]">{factor.label}</div>
                  <div>权重 {factor.weight} · 扣分 {factor.penalty}</div>
                  <div className="mt-1">{factor.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <SectionCard title="Critical Issues" description="按优先级收敛最重要的风险项，默认仅展示前 10 条。">
          <div data-testid="dashboard-critical-issues" className="space-y-3">
            {dashboard?.criticalIssues.length ? dashboard.criticalIssues.map(issue => (
              <button key={issue.id} data-testid={`dashboard-critical-issue-${issue.id}`} type="button" onClick={() => setSelectedIssueId(issue.id)} className="w-full text-left border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(issue.severity)}`}>{issue.issueType}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{issue.workspaceName}</span>
                      {issue.targetName && <span className="text-xs text-[hsl(var(--muted-foreground))]">{issue.targetName}</span>}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{issue.summary}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">最近发生：{formatDateTime(issue.lastOccurredAt)}</div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {issue.actions.map(action => (
                      <button
                        key={`${issue.id}-${action.label}`}
                        data-testid={`dashboard-critical-action-${issue.id}`}
                        type="button"
                        onClick={() => navigate(action.route)}
                        className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </button>
            )) : <div data-testid="dashboard-critical-issues-empty" className="text-sm text-[hsl(var(--muted-foreground))]">当前没有关键风险项。</div>}
          </div>
        </SectionCard>

        <SectionCard title="Quick Actions" description="Dashboard 只触发安全入口动作；高危执行仍走原有审批与链路。">
          <div data-testid="dashboard-quick-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map(action => (
              <button
                key={action.label}
                data-testid={`dashboard-quick-action-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="text-left border border-[hsl(var(--border))] rounded-workshop-md p-4 hover:bg-[hsl(var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{action.label}</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{action.description}</div>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Runtime Status" description="统一展示 Operations、Host Agents、Deployment、Auto-Remediation 与整体趋势。">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Operations Snapshot</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">关键动作执行态与近 24h / 7d 趋势</div>
                </div>
                <Link to="/operations" className="text-xs text-[hsl(var(--primary))]">查看全部</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>运行中：<span className="font-semibold">{dashboard?.runtime.operations.running ?? 0}</span></div>
                <div>待审批：<span className="font-semibold">{dashboard?.runtime.operations.waitingApproval ?? 0}</span></div>
                <div>24h 成功 / 失败：<span className="font-semibold">{dashboard?.runtime.operations.last24hSucceeded ?? 0} / {dashboard?.runtime.operations.last24hFailed ?? 0}</span></div>
                <div>7d 成功 / 失败：<span className="font-semibold">{dashboard?.runtime.operations.last7dSucceeded ?? 0} / {dashboard?.runtime.operations.last7dFailed ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.operations.recent.map(operation => (
                  <div key={operation.id} className="flex items-center justify-between gap-3 text-sm border border-[hsl(var(--border))] rounded-workshop-sm px-3 py-2">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{operation.title}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{operation.type} · {formatDateTime(operation.updatedAt)}</div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(operation.status === 'FAILED' ? 'FAILED' : operation.status)}`}>{operation.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Host Agent Health</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">在线 / 离线 / 心跳异常摘要</div>
                </div>
                <Link to="/host-agents" className="text-xs text-[hsl(var(--primary))]">查看全部</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>Online：<span className="font-semibold">{dashboard?.runtime.hostAgents.online ?? 0}</span></div>
                <div>Degraded：<span className="font-semibold">{dashboard?.runtime.hostAgents.degraded ?? 0}</span></div>
                <div>Offline：<span className="font-semibold">{dashboard?.runtime.hostAgents.offline ?? 0}</span></div>
                <div>异常心跳：<span className="font-semibold">{dashboard?.runtime.hostAgents.recentHeartbeatAnomalies ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.hostAgents.recentAnomalies.length ? dashboard.runtime.hostAgents.recentAnomalies.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between gap-3 text-sm border border-[hsl(var(--border))] rounded-workshop-sm px-3 py-2">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{agent.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{agent.lastHeartbeatAt ? formatDateTime(agent.lastHeartbeatAt) : '从未心跳'}</div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(agent.status)}`}>{agent.status}</span>
                  </div>
                )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">没有心跳异常 Agent。</div>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Deployment Status</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Target 运行状态与最近部署结果</div>
                </div>
                <Link to="/deployments" className="text-xs text-[hsl(var(--primary))]">查看全部</Link>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>Healthy：<span className="font-semibold">{dashboard?.runtime.deployments.healthy ?? 0}</span></div>
                <div>Degraded：<span className="font-semibold">{dashboard?.runtime.deployments.degraded ?? 0}</span></div>
                <div>Unreachable：<span className="font-semibold">{dashboard?.runtime.deployments.unreachable ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.deployments.recentJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-3 text-sm border border-[hsl(var(--border))] rounded-workshop-sm px-3 py-2">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{job.targetName}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{job.type} · {formatDateTime(job.createdAt)}</div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(job.status === 'FAILED' ? 'FAILED' : job.status)}`}>{job.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Auto-Remediation Snapshot</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">基于现有 DOCTOR_FIX / 修复链路聚合今日运行态</div>
                </div>
                <Link to="/operations" className="text-xs text-[hsl(var(--primary))]">查看链路</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>今日总数：<span className="font-semibold">{dashboard?.runtime.remediation.todayTotal ?? 0}</span></div>
                <div>Running：<span className="font-semibold">{dashboard?.runtime.remediation.running ?? 0}</span></div>
                <div>Blocked：<span className="font-semibold">{dashboard?.runtime.remediation.blocked ?? 0}</span></div>
                <div>Failed / Succeeded：<span className="font-semibold">{dashboard?.runtime.remediation.failed ?? 0} / {dashboard?.runtime.remediation.succeeded ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.remediation.recent.length ? dashboard.runtime.remediation.recent.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm border border-[hsl(var(--border))] rounded-workshop-sm px-3 py-2">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{item.title}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateTime(item.updatedAt)}</div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(item.status === 'FAILED' ? 'FAILED' : item.status)}`}>{item.status}</span>
                  </div>
                )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">当前没有自动修复链路记录。</div>}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-3">
                CRITICAL 事件趋势：24h {dashboard?.runtime.trends.criticalEvents24h ?? 0} · 7d {dashboard?.runtime.trends.criticalEvents7d ?? 0}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <SectionCard title="Pending Actions" description="待审批、待变更、待升级、待收敛与人工介入事项。">
          <div data-testid="dashboard-pending-actions" className="space-y-3">
            {dashboard?.pendingActions.length ? dashboard.pendingActions.map(item => (
              <button
                key={item.id}
                data-testid={`dashboard-pending-action-${item.id}`}
                type="button"
                onClick={() => setSelectedActionId(item.id)}
                className="w-full text-left border border-[hsl(var(--border))] rounded-workshop-md p-4 hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs rounded-full border bg-[hsl(var(--muted))]">{item.actionType}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.workspaceName}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{item.title}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.summary}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-[hsl(var(--foreground))]">{item.status}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{formatDateTime(item.createdAt)}</div>
                  </div>
                </div>
              </button>
            )) : <div data-testid="dashboard-pending-actions-empty" className="text-sm text-[hsl(var(--muted-foreground))]">当前没有待办事项。</div>}
          </div>
        </SectionCard>

        <SectionCard title="Activity Feed Preview" description="最近事件按时间倒序展示，可按当前 Workspace / severity / source_type 过滤。">
          <div data-testid="dashboard-activity-feed-preview" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                data-testid="dashboard-activity-severity-filter"
                value={activitySeverity}
                onChange={(event) => setActivitySeverity(event.target.value)}
                className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              >
                <option value="">全部严重级别</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <input
                data-testid="dashboard-activity-source-filter"
                value={activitySourceType}
                onChange={(event) => setActivitySourceType(event.target.value)}
                placeholder="source_type"
                className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              />
              <button
                data-testid="dashboard-activity-apply-filter"
                type="button"
                onClick={() => void refreshAll()}
                className="px-3 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90 text-sm"
              >
                应用过滤
              </button>
            </div>

            <div className="space-y-3">
              {dashboard?.activityPreview.length ? dashboard.activityPreview.map(item => (
                <button
                  key={item.id}
                  data-testid={`dashboard-activity-item-${item.id}`}
                  type="button"
                  onClick={() => setSelectedActivityId(item.id)}
                  className="w-full text-left border border-[hsl(var(--border))] rounded-workshop-md p-4 hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(item.severity)}`}>{item.severity}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.sourceType}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.workspaceName}</span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{item.title}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.summary}</div>
                      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.targetName ? `${item.targetName} · ` : ''}{formatDateTime(item.createdAt)}
                      </div>
                    </div>
                    <div className="text-xs text-[hsl(var(--primary))] shrink-0">查看完整流</div>
                  </div>
                </button>
              )) : <div data-testid="dashboard-activity-empty" className="text-sm text-[hsl(var(--muted-foreground))]">当前筛选条件下暂无事件。</div>}
            </div>
          </div>
        </SectionCard>
      </div>



      {/* Critical Issues Drawer */}
      <Drawer
        isOpen={!!selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        title="Critical Issue Details"
        activeId={selectedIssueId}
        subtitle={selectedIssueId ? `ID: ${selectedIssueId.slice(0, 8)}` : undefined}
      >
        {selectedIssueId && dashboard?.criticalIssues && (() => {
          const issue = dashboard.criticalIssues.find(i => i.id === selectedIssueId)
          if (!issue) return <div className="text-sm text-[hsl(var(--muted-foreground))]">未找到该问题详情。</div>
          return (
            <div className="space-y-4">
              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--muted))]" data-testid="drawer-issue-summary">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">问题摘要</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{issue.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">问题类型</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{issue.issueType}</div>
                </div>
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">严重程度</div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(issue.severity)}`}>{issue.severity}</span>
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">关联信息</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Workspace:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{issue.workspaceName}</span>
                  </div>
                  {issue.targetName && (
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">Target:</span>
                      <span className="font-medium text-[hsl(var(--foreground))]">{issue.targetName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">最近发生:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(issue.lastOccurredAt)}</span>
                  </div>
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--accent))]">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">下一步操作</div>
                <div className="space-y-2">
                  {issue.actions.map(action => (
                    <button
                      key={`${issue.id}-${action.label}`}
                      type="button"
                      onClick={() => {
                        setSelectedIssueId(null)
                        navigate(action.route)
                      }}
                      className="w-full px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                      data-testid={`drawer-issue-action-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* Pending Actions Drawer */}
      <Drawer
        isOpen={!!selectedActionId}
        onClose={() => setSelectedActionId(null)}
        title="Pending Action Details"
        activeId={selectedActionId}
        subtitle={selectedActionId ? `ID: ${selectedActionId.slice(0, 8)}` : undefined}
      >
        {selectedActionId && dashboard?.pendingActions && (() => {
          const action = dashboard.pendingActions.find(a => a.id === selectedActionId)
          if (!action) return <div className="text-sm text-[hsl(var(--muted-foreground))]">未找到该待办事项详情。</div>
          return (
            <div className="space-y-4">
              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--muted))]" data-testid="drawer-action-summary">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">待办标题</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{action.title}</div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">详细说明</div>
                <div className="text-sm text-[hsl(var(--foreground))]">{action.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">动作类型</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{action.actionType}</div>
                </div>
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">当前状态</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{action.status}</div>
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">关联信息</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Workspace:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{action.workspaceName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">创建时间:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(action.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--accent))]">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">跳转到原模块</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActionId(null)
                    navigate(action.route)
                  }}
                  className="w-full px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  data-testid="drawer-action-navigate"
                >
                  前往处理
                </button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* Activity Feed Drawer */}
      <Drawer
        isOpen={!!selectedActivityId}
        onClose={() => setSelectedActivityId(null)}
        title="Activity Event Details"
        activeId={selectedActivityId}
        subtitle={selectedActivityId ? `ID: ${selectedActivityId.slice(0, 8)}` : undefined}
      >
        {selectedActivityId && dashboard?.activityPreview && (() => {
          const activity = dashboard.activityPreview.find(a => a.id === selectedActivityId)
          if (!activity) return <div className="text-sm text-[hsl(var(--muted-foreground))]">未找到该事件详情。</div>
          return (
            <div className="space-y-4">
              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--muted))]" data-testid="drawer-activity-summary">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">事件标题</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{activity.title}</div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">事件摘要</div>
                <div className="text-sm text-[hsl(var(--foreground))]">{activity.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">严重程度</div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadgeClass(activity.severity)}`}>{activity.severity}</span>
                </div>
                <div className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">事件类型</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{activity.eventType}</div>
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">关联信息</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">来源类型:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{activity.sourceType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Workspace:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{activity.workspaceName}</span>
                  </div>
                  {activity.targetName && (
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">Target:</span>
                      <span className="font-medium text-[hsl(var(--foreground))]">{activity.targetName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">发生时间:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(activity.createdAt)}</span>
                  </div>
                  {activity.traceId && (
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">Trace ID:</span>
                      <span className="font-mono text-xs text-[hsl(var(--foreground))]">{activity.traceId}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--accent))]">
                <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">查看完整事件流</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityId(null)
                    navigate('/activity-feed')
                  }}
                  className="w-full px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  data-testid="drawer-activity-navigate"
                >
                  前往 Activity Feed
                </button>
              </div>
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}
