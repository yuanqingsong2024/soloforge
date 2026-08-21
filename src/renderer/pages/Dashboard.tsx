import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useErrorMessage } from '../lib/i18n-helpers'
import { apiFetch, ApiResponse } from '../lib/api'
import { readLocalStorage, readWorkspaceId, writeLocalStorage } from '../lib/storage'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { ThemeCheckbox, ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { Drawer } from '../components/ui/Drawer'
import { LoadingState, Button } from '../components/ui'
import { envTypeMap } from '../lib/i18n-enums'
import { translateEnum } from '../lib/i18n-helpers'
import { SkipLink, LiveRegion, regionA11y } from '../components/a11y'

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
  issueType: 'CRITICAL_ALERT' | 'CRITICAL_DRIFT' | 'FAILED_UPGRADE' | 'FAILED_REMEDIATION' | 'OFFLINE_AGENT' | 'UNREACHABLE_TARGET' | 'FAILED_JOB' | 'OUTBOX_FAILURE' | 'BACKUP_STALE' | 'MIGRATION_ISSUE'
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

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'border-[hsl(var(--google-red)_/_0.24)] bg-[hsl(var(--google-red)_/_0.16)] text-[hsl(var(--destructive))]'
    case 'HIGH':
      return 'border-[hsl(var(--google-yellow)_/_0.28)] bg-[hsl(var(--google-yellow)_/_0.22)] text-[hsl(var(--foreground))]'
    case 'FAILED':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    case 'OFFLINE':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    default:
      return 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
  }
}

function getHealthScoreClass(label: DashboardHealthScore['label']): string {
  switch (label) {
    case 'GOOD':
      return 'text-[hsl(var(--success))]'
    case 'WARNING':
      return 'text-[hsl(var(--google-yellow))]'
    case 'CRITICAL':
      return 'text-[hsl(var(--destructive))]'
  }
}

function getStatusLabel(t: (key: string) => string, label: DashboardHealthScore['label']): string {
  switch (label) {
    case 'GOOD':
      return t('dashboard:healthScore.good')
    case 'WARNING':
      return t('dashboard:healthScore.warning')
    case 'CRITICAL':
      return t('dashboard:healthScore.critical')
  }
}

function getWorkspaceDisplayName(t: (key: string, options?: Record<string, unknown>) => string, name: string): string {
  const translated = t(`common:workspaceNames.${name}`, { defaultValue: name })
  return translated || name
}

function getIssueTypeLabel(t: (key: string) => string, value: string): string {
  return translateEnum(t, 'criticalIssueTypeMap', value)
}

function getPendingActionLabel(t: (key: string) => string, value: string): string {
  return translateEnum(t, 'pendingActionTypeMap', value)
}

function getStatusText(t: (key: string) => string, value: string): string {
  return translateEnum(t, 'operationStatusMap', value)
}

function getSeverityText(t: (key: string) => string, value: string): string {
  return translateEnum(t, 'severityMap', value)
}

function appendQuery(route: string, query: Record<string, string | undefined>): string {
  const [path, search = ''] = route.split('?')
  const params = new URLSearchParams(search)
  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      params.set(key, value)
    }
  })
  const nextSearch = params.toString()
  return nextSearch ? `${path}?${nextSearch}` : path
}

function buildOverviewCards(t: (key: string, options?: Record<string, unknown>) => string, overview: DashboardOverview): Array<{
  key: string
  title: string
  value: string
  subtitle: string
  route: string
}> {
  return [
    {
      key: 'workspaces',
      title: t('dashboard:overview.workspaces'),
      value: String(overview.workspaceCount),
      subtitle: t('dashboard:overview.workspacesSubtitle'),
      route: '/workspace-settings'
    },
    {
      key: 'targets',
      title: t('dashboard:overview.targets'),
      value: String(overview.targetTotals.total),
      subtitle: t('dashboard:overview.targetsSubtitle', { healthy: overview.targetTotals.healthy, degraded: overview.targetTotals.degraded, unreachable: overview.targetTotals.unreachable }),
      route: '/deployments'
    },
    {
      key: 'alerts',
      title: t('dashboard:overview.openAlerts'),
      value: String(overview.openAlerts),
      subtitle: t('dashboard:overview.openAlertsSubtitle'),
      route: '/health-monitoring?tab=alerts'
    },
    {
      key: 'drift',
      title: t('dashboard:overview.criticalDrift'),
      value: String(overview.criticalDrift),
      subtitle: t('dashboard:overview.criticalDriftSubtitle'),
      route: '/health-monitoring?tab=doctor'
    },
    {
      key: 'operations',
      title: t('dashboard:overview.runningOperations'),
      value: String(overview.runningOperations),
      subtitle: t('dashboard:overview.runningOperationsSubtitle'),
      route: '/operations'
    },
    {
      key: 'approvals',
      title: t('dashboard:overview.pendingApprovals'),
      value: String(overview.pendingApprovals),
      subtitle: t('dashboard:overview.pendingApprovalsSubtitle'),
      route: '/approvals'
    },
    {
      key: 'agents',
      title: t('dashboard:overview.agents'),
      value: `${overview.agents.online}/${overview.agents.offline}`,
      subtitle: t('dashboard:overview.agentsSubtitle'),
      route: '/host-agents'
    },
    {
      key: 'updates',
      title: t('dashboard:overview.availableUpdates'),
      value: String(overview.availableUpdates),
      subtitle: t('dashboard:overview.availableUpdatesSubtitle'),
      route: '/releases'
    }
  ]
}

function buildRecommendedActions(t: (key: string, options?: Record<string, unknown>) => string, dashboard: DashboardPayload): Array<{
  key: string
  title: string
  description: string
  route: string
  priority: 'urgent' | 'today' | 'later'
}> {
  const recommendations: Array<{
    key: string
    title: string
    description: string
    route: string
    priority: 'urgent' | 'today' | 'later'
  }> = []

  if (dashboard.criticalIssues.length > 0) {
    recommendations.push({
      key: 'critical-issues',
      title: t('dashboard:recommendedActions.criticalIssuesTitle', { count: dashboard.criticalIssues.length }),
      description: dashboard.criticalIssues[0]?.summary || t('dashboard:recommendedActions.criticalIssuesDesc'),
      route: dashboard.criticalIssues[0]?.actions[0]?.route || '/health-monitoring',
      priority: 'urgent'
    })
  }

  if (dashboard.overview.targetTotals.unreachable > 0) {
    recommendations.push({
      key: 'unreachable-targets',
      title: t('dashboard:recommendedActions.unreachableTargetsTitle', { count: dashboard.overview.targetTotals.unreachable }),
      description: t('dashboard:recommendedActions.unreachableTargetsDesc'),
      route: '/deployments',
      priority: 'urgent'
    })
  }

  if (dashboard.overview.criticalDrift > 0) {
    recommendations.push({
      key: 'critical-drift',
      title: t('dashboard:recommendedActions.criticalDriftTitle', { count: dashboard.overview.criticalDrift }),
      description: t('dashboard:recommendedActions.criticalDriftDesc'),
      route: '/health-monitoring?tab=doctor',
      priority: 'urgent'
    })
  }

  if (dashboard.pendingActions.length > 0) {
    recommendations.push({
      key: 'pending-actions',
      title: t('dashboard:recommendedActions.pendingActionsTitle', { count: dashboard.pendingActions.length }),
      description: dashboard.pendingActions[0]?.summary || t('dashboard:recommendedActions.pendingActionsDesc'),
      route: dashboard.pendingActions[0]?.route || '/approvals',
      priority: 'today'
    })
  }

  if (dashboard.runtime.hostAgents.offline > 0 || dashboard.runtime.hostAgents.degraded > 0) {
    recommendations.push({
      key: 'host-agents',
      title: t('dashboard:recommendedActions.hostAgentsTitle', {
        offline: dashboard.runtime.hostAgents.offline,
        degraded: dashboard.runtime.hostAgents.degraded
      }),
      description: t('dashboard:recommendedActions.hostAgentsDesc'),
      route: '/host-agents',
      priority: 'today'
    })
  }

  if (dashboard.runtime.operations.waitingApproval > 0) {
    recommendations.push({
      key: 'waiting-approval',
      title: t('dashboard:recommendedActions.waitingApprovalTitle', { count: dashboard.runtime.operations.waitingApproval }),
      description: t('dashboard:recommendedActions.waitingApprovalDesc'),
      route: '/approvals',
      priority: 'today'
    })
  }

  if (dashboard.overview.availableUpdates > 0) {
    recommendations.push({
      key: 'available-updates',
      title: t('dashboard:recommendedActions.availableUpdatesTitle', { count: dashboard.overview.availableUpdates }),
      description: t('dashboard:recommendedActions.availableUpdatesDesc'),
      route: '/releases',
      priority: 'later'
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      key: 'all-clear',
      title: t('dashboard:recommendedActions.allClearTitle'),
      description: t('dashboard:recommendedActions.allClearDesc'),
      route: '/operations',
      priority: 'later'
    })
  }

  return recommendations.slice(0, 5)
}

function getRecommendedActionClass(priority: 'urgent' | 'today' | 'later'): string {
  switch (priority) {
    case 'urgent':
      return 'border-[hsl(var(--google-red)_/_0.22)] bg-[hsl(var(--google-red)_/_0.08)]'
    case 'today':
      return 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.08)]'
    case 'later':
      return 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.07)]'
  }
}

function getOverviewCardAccentClass(key: string): string {
  switch (key) {
    case 'alerts':
    case 'drift':
      return 'bg-[hsl(var(--google-red)_/_0.72)]'
    case 'operations':
    case 'approvals':
      return 'bg-[hsl(var(--google-yellow)_/_0.78)]'
    case 'agents':
    case 'targets':
      return 'bg-[hsl(var(--google-green)_/_0.72)]'
    default:
      return 'bg-[hsl(var(--google-blue)_/_0.72)]'
  }
}

export function Dashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation(['dashboard', 'common'])
  const getErrorMessage = useErrorMessage()
  
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
    const stored = readLocalStorage('soloforge-dashboard-mode')
    return stored === 'global' ? 'global' : 'workspace'
  })
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => {
    return readWorkspaceId() || DEFAULT_WORKSPACE_ID
  })
  const [showSetupBanner, setShowSetupBanner] = useState(false)

  // Drawer 状态管理
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const effectiveWorkspaceId = workspaceMode === 'workspace' ? selectedWorkspaceId : undefined
  const overviewCards = useMemo(() => (dashboard ? buildOverviewCards(t, dashboard.overview) : []), [dashboard, t])
  const recommendedActions = useMemo(() => (dashboard ? buildRecommendedActions(t, dashboard) : []), [dashboard, t])
  const withWorkspaceContext = useCallback((route: string) => appendQuery(route, { workspaceId: effectiveWorkspaceId }), [effectiveWorkspaceId])

  const fetchWorkspaces = useCallback(async () => {
    const data = await apiFetch<WorkspaceOption[]>('/api/workspaces')
    setWorkspaces(Array.isArray(data) ? data : [])
  }, [])

  const fetchDashboard = useCallback(async (options?: { silent?: boolean }) => {
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

    const json = await apiFetch<ApiResponse<DashboardPayload>>(`/api/dashboard?${params.toString()}`)
    if (!json.success) {
      throw new Error(json.error)
    }

    setDashboard(json.data ?? null)
  }, [activitySeverity, activitySourceType, effectiveWorkspaceId])

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([fetchWorkspaces(), fetchDashboard()])
        
        const setupData = await apiFetch<{ setupCompleted: boolean }>(`/api/setup/status?workspaceId=${selectedWorkspaceId}`)
        if (!setupData.setupCompleted) {
          setShowSetupBanner(true)
        }
      } catch (currentError) {
        setError(currentError instanceof Error ? currentError.message : String(currentError))
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [fetchDashboard, fetchWorkspaces, selectedWorkspaceId])

  useEffect(() => {
    if (!autoRefreshEnabled) return
    const timer = window.setInterval(() => {
      void fetchDashboard({ silent: true }).catch(currentError => {
        setStatusMessage(t('dashboard:messages.autoRefreshFailed', {
          error: currentError instanceof Error ? currentError.message : String(currentError)
        }))
      })
    }, 30000)

    return () => window.clearInterval(timer)
  }, [autoRefreshEnabled, fetchDashboard, t])

  useEffect(() => {
    writeLocalStorage('soloforge-dashboard-mode', workspaceMode)
  }, [workspaceMode])

  const refreshAll = async () => {
    setRefreshing(true)
    setStatusMessage(null)
    try {
      await Promise.all([fetchWorkspaces(), fetchDashboard()])
      setStatusMessage(t('dashboard:messages.refreshed', {
        time: new Date().toLocaleTimeString('zh-CN')
      }))
    } catch (currentError) {
      setError(getErrorMessage(currentError))
    } finally {
      setRefreshing(false)
    }
  }

  const handleSkipSetup = async () => {
    try {
      await apiFetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          actor: 'user',
          action: 'SETUP_SKIPPED',
          tool: 'setup-wizard',
          request: JSON.stringify({ timestamp: new Date().toISOString() }),
          response: JSON.stringify({ success: true })
        })
      })
      setShowSetupBanner(false)
    } catch (err) {
      console.error('Failed to log setup skip:', err)
      setShowSetupBanner(false)
    }
  }

  const switchWorkspace = async (nextMode: 'global' | 'workspace', nextWorkspaceId?: string) => {
    const resolvedWorkspaceId = nextWorkspaceId || selectedWorkspaceId
    setWorkspaceMode(nextMode)
    if (nextWorkspaceId) {
      setSelectedWorkspaceId(nextWorkspaceId)
      writeLocalStorage('soloforge-current-workspace', nextWorkspaceId)
    }
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

      const json = await apiFetch<ApiResponse<DashboardPayload>>(`/api/dashboard?${params.toString()}`)
      if (!json.success) {
        throw new Error(json.error)
      }
      setDashboard(json.data ?? null)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : String(currentError))
    } finally {
      setRefreshing(false)
    }
  }

  const runDoctorCheck = async () => {
    if (!selectedWorkspaceId) return
    setStatusMessage(t('dashboard:messages.runningDoctorCheck'))
    try {
      const json = await apiFetch<ApiResponse<unknown>>('/api/doctor/run', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: selectedWorkspaceId, createdBy: 'admin' })
      })
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage(t('dashboard:messages.doctorCheckTriggered'))
      navigate(withWorkspaceContext('/health-monitoring?tab=doctor'))
    } catch (currentError) {
      setStatusMessage(t('dashboard:messages.doctorCheckFailed', {
        error: getErrorMessage(currentError)
      }))
    }
  }

  const syncActual = async () => {
    if (!selectedWorkspaceId) return
    setStatusMessage(t('dashboard:messages.syncingActual'))
    try {
      const json = await apiFetch<ApiResponse<unknown>>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/snapshots/actual`, {
        method: 'POST'
      })
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage(t('dashboard:messages.actualSynced'))
      await refreshAll()
    } catch (currentError) {
      setStatusMessage(t('dashboard:messages.syncActualFailed', {
        error: getErrorMessage(currentError)
      }))
    }
  }

  const createReconcilePlan = async () => {
    if (!selectedWorkspaceId) return
    setStatusMessage(t('dashboard:messages.computingDrift'))
    try {
      const json = await apiFetch<ApiResponse<unknown>>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/drift/compute`, {
        method: 'POST'
      })
      if (!json.success) {
        throw new Error(json.error)
      }
      setStatusMessage(t('dashboard:messages.driftComputed'))
      navigate(withWorkspaceContext('/health-monitoring?tab=doctor'))
    } catch (currentError) {
      setStatusMessage(t('dashboard:messages.reconcilePlanFailed', {
        error: getErrorMessage(currentError)
      }))
    }
  }

  const quickActions: Array<{
    label: string
    description: string
    onClick: () => void
    disabled?: boolean
  }> = [
    {
      label: t('dashboard:quickActions.syncActual'),
      description: t('dashboard:quickActions.syncActualDesc'),
      onClick: () => { void syncActual() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: t('dashboard:quickActions.runDoctorCheck'),
      description: t('dashboard:quickActions.runDoctorCheckDesc'),
      onClick: () => { void runDoctorCheck() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: t('dashboard:quickActions.createReconcilePlan'),
      description: t('dashboard:quickActions.createReconcilePlanDesc'),
      onClick: () => { void createReconcilePlan() },
      disabled: workspaceMode !== 'workspace'
    },
    {
      label: t('dashboard:quickActions.openPendingApprovals'),
      description: t('dashboard:quickActions.openPendingApprovalsDesc'),
      onClick: () => navigate(withWorkspaceContext('/approvals?status=PENDING'))
    },
    {
      label: t('dashboard:quickActions.viewOfflineAgents'),
      description: t('dashboard:quickActions.viewOfflineAgentsDesc'),
      onClick: () => navigate(withWorkspaceContext('/host-agents?status=OFFLINE'))
    },
    {
      label: t('dashboard:quickActions.viewFailedUpgrades'),
      description: t('dashboard:quickActions.viewFailedUpgradesDesc'),
      onClick: () => navigate(withWorkspaceContext('/upgrade-plans?status=FAILED'))
    },
    {
      label: t('dashboard:quickActions.newDeploymentTarget'),
      description: t('dashboard:quickActions.newDeploymentTargetDesc'),
      onClick: () => navigate(withWorkspaceContext('/deployments/new'))
    },
    {
      label: t('dashboard:quickActions.bootstrapHostAgent'),
      description: t('dashboard:quickActions.bootstrapHostAgentDesc'),
      onClick: () => navigate(withWorkspaceContext('/host-agents/new'))
    }
  ]

  if (loading) {
    return <LoadingState message={t('dashboard:messages.loading')} />
  }

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* 跳过链接 - 方便键盘导航用户快速到达主内容 */}
      <SkipLink to="#dashboard-main">{t('dashboard:a11y.skipToMain')}</SkipLink>

      {/* 实时状态区域 - 通知屏幕阅读器动态更新 */}
      <LiveRegion politeness="polite">{statusMessage || error || ''}</LiveRegion>

      <main id="dashboard-main" {...regionA11y(t('dashboard:a11y.mainRegion'))}>
      <PageHeader
        title={t('dashboard:title')}
        description={t('dashboard:description')}
        actions={
          <>
            <Button data-testid="dashboard-refresh-button" onClick={() => void refreshAll()} loading={refreshing}>
              {t('dashboard:actions.refresh')}
            </Button>
            <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] shadow-sm">
              <ThemeCheckbox data-testid="dashboard-auto-refresh-toggle" checked={autoRefreshEnabled} onChange={(event) => setAutoRefreshEnabled(event.target.checked)} />
              {t('dashboard:actions.autoRefresh')}
            </label>
          </>
        }
      />

      {(error || statusMessage) && (
        <div className="space-y-2">
          {error && (
            <div data-testid="dashboard-error-banner" className="rounded-lg border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.1)] p-3 text-sm text-[hsl(var(--destructive))]">
              {t('dashboard:messages.loadFailed', { error })}
            </div>
          )}
          {statusMessage && (
            <div data-testid="dashboard-status-banner" className="rounded-lg border border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.1)] p-3 text-sm text-[hsl(var(--google-blue))]">
              {statusMessage}
            </div>
          )}
        </div>
      )}

      {showSetupBanner && (
        <SectionCard title={t('dashboard:setupBanner.title')} className="border-l-4 border-[hsl(var(--google-blue))]">
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('dashboard:setupBanner.description')}
            </p>
            <div className="flex gap-3">
              <Button onClick={() => navigate('/setup/wizard')}>
                {t('dashboard:setupBanner.startSetup')}
              </Button>
              <Button variant="secondary" onClick={() => void handleSkipSetup()}>
                {t('dashboard:setupBanner.skipSetup')}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title={t('dashboard:sections.globalOverview')} description={t('dashboard:sections.globalOverviewDesc')}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)] xl:items-stretch">
          <div data-testid="dashboard-global-overview" className="space-y-4 xl:grid xl:h-full xl:grid-rows-[auto_minmax(0,1fr)] xl:gap-4 xl:space-y-0">
            <div data-testid="dashboard-workspace-controls" className="grid grid-cols-1 gap-3 rounded-lg sm:grid-cols-[auto_auto_minmax(16rem,1fr)] sm:items-center border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-sm">
              <button
                data-testid="dashboard-workspace-mode-global"
                type="button"
                onClick={() => void switchWorkspace('global')}
                className={`rounded-full px-4 py-2.5 text-sm font-medium border transition-colors ${workspaceMode === 'global' ? 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'}`}
              >
                {t('dashboard:workspace.globalMode')}
              </button>
              <button
                data-testid="dashboard-workspace-mode-current"
                type="button"
                onClick={() => void switchWorkspace('workspace')}
                className={`rounded-full px-4 py-2.5 text-sm font-medium border transition-colors ${workspaceMode === 'workspace' ? 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'}`}
              >
                {t('dashboard:workspace.currentMode')}
              </button>
              <ThemeSelect
                data-testid="dashboard-workspace-switcher"
                value={selectedWorkspaceId}
                onChange={(event) => void switchWorkspace('workspace', event.target.value)}
                fieldSize="lg"
                fieldShape="pill"
                className="min-w-[14rem]"
              >
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>
                    {getWorkspaceDisplayName(t, workspace.name)} · {t(envTypeMap[workspace.envType] || workspace.envType)}
                  </option>
                ))}
              </ThemeSelect>
            </div>

            <div data-testid="dashboard-overview-cards" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:h-full xl:auto-rows-fr xl:grid-cols-2">
              {overviewCards.map(card => (
                <Link
                  key={card.key}
                  to={withWorkspaceContext(card.route)}
                  data-testid={`dashboard-overview-card-${card.key}`}
                  className="group block"
                  title={card.subtitle}
                  aria-label={`${card.title} ${card.subtitle}`}
                >
                  <SectionCard className="relative h-full !p-0 overflow-hidden transition-colors group-hover:border-[hsl(var(--google-blue)_/_0.18)] group-hover:bg-[hsl(var(--accent)_/_0.32)]">
                    <div className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${getOverviewCardAccentClass(card.key)}`} />
                    <div className="flex min-h-[5.75rem] items-start justify-between gap-4 px-4 py-3 pl-5 xl:min-h-full xl:px-5 xl:py-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold leading-7 text-[hsl(var(--foreground))] break-words">{card.title}</div>
                      </div>
                      <div className="shrink-0 pt-1 text-2xl font-bold leading-none tracking-tight text-[hsl(var(--foreground))] tabular-nums xl:text-[2rem]">{card.value}</div>
                    </div>
                  </SectionCard>
                </Link>
              ))}
            </div>
          </div>

          <div data-testid="dashboard-health-score" className="space-y-4 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-5 shadow-sm xl:h-full">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{t('dashboard:healthScore.title')}</div>
                <div className={`mt-1 text-4xl font-bold leading-none ${dashboard ? getHealthScoreClass(dashboard.healthScore.label) : ''}`}>
                  {dashboard?.healthScore.score ?? 0}
                </div>
                <div className="mt-2 text-sm font-medium text-[hsl(var(--foreground))]">
                  {dashboard ? getStatusLabel(t, dashboard.healthScore.label) : '—'}
                </div>
              </div>
              <div className="max-w-[180px] text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                {dashboard?.healthScore.summary}
              </div>
            </div>
            <div className="space-y-2">
              {dashboard?.healthScore.factors.map(factor => (
                <div key={factor.key} className="rounded-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 font-medium text-[hsl(var(--foreground))]">{factor.label}</div>
                    <div className="shrink-0 whitespace-nowrap text-[11px] text-[hsl(var(--muted-foreground))]">
                      {t('dashboard:healthScore.factorWeight', { weight: factor.weight, penalty: factor.penalty })}
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 leading-5">{factor.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('dashboard:sections.recommendedActions')} description={t('dashboard:sections.recommendedActionsDesc')}>
        <div data-testid="dashboard-recommended-actions" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recommendedActions.map(action => (
            <button
              key={action.key}
              data-testid={`dashboard-recommended-action-${action.key}`}
              type="button"
              onClick={() => navigate(withWorkspaceContext(action.route))}
              className={`min-w-0 flex h-full flex-col rounded-lg border p-4 text-left shadow-sm transition-colors duration-200 hover:bg-[hsl(var(--accent)_/_0.62)] ${getRecommendedActionClass(action.priority)}`}
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                {t(`dashboard:recommendedActions.priority.${action.priority}`)}
              </div>
              <div className="mb-3 text-sm font-semibold leading-5 text-[hsl(var(--foreground))] [overflow-wrap:anywhere]">{action.title}</div>
              <div className="text-xs leading-5 text-[hsl(var(--muted-foreground))] [overflow-wrap:anywhere]">{action.description}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <SectionCard title={t('dashboard:sections.criticalIssues')} description={t('dashboard:sections.criticalIssuesDesc')}>
          <div data-testid="dashboard-critical-issues" className="space-y-3">
            {dashboard?.criticalIssues.length ? dashboard.criticalIssues.map(issue => (
              <div key={issue.id} data-testid={`dashboard-critical-issue-${issue.id}`} className="w-full rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm transition-colors hover:bg-[hsl(var(--accent)_/_0.62)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(issue.severity)}`}>{getIssueTypeLabel(t, issue.issueType)}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{issue.workspaceName}</span>
                      {issue.targetName && <span className="text-xs text-[hsl(var(--muted-foreground))]">{issue.targetName}</span>}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{issue.summary}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard:criticalIssues.lastOccurred', { time: formatDateTime(issue.lastOccurredAt) })}</div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {issue.actions.map(action => (
                      <button
                        key={`${issue.id}-${action.label}`}
                        data-testid={`dashboard-critical-action-${issue.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(withWorkspaceContext(action.route))
                        }}
                         className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.7)] px-3 py-1.5 text-xs text-[hsl(var(--foreground))] transition-colors duration-200 hover:bg-[hsl(var(--accent))]"
                       >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )) : <div data-testid="dashboard-critical-issues-empty" className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:criticalIssues.empty')}</div>}
          </div>
        </SectionCard>

        <SectionCard title={t('dashboard:sections.quickActions')} description={t('dashboard:sections.quickActionsDesc')}>
          <div data-testid="dashboard-quick-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map(action => (
              <button
                key={action.label}
                data-testid={`dashboard-quick-action-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="text-left rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm transition-colors hover:bg-[hsl(var(--accent)_/_0.62)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{action.label}</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{action.description}</div>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t('dashboard:sections.runtimeStatus')} description={t('dashboard:sections.runtimeStatusDesc')}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('dashboard:runtime.operationsSnapshot')}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.operationsSnapshotDesc')}</div>
                </div>
                <Link to="/operations" className="text-xs text-[hsl(var(--primary))]">{t('common:buttons.viewAll')}</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>{t('dashboard:runtime.running')}：<span className="font-semibold">{dashboard?.runtime.operations.running ?? 0}</span></div>
                <div>{t('dashboard:runtime.waitingApproval')}：<span className="font-semibold">{dashboard?.runtime.operations.waitingApproval ?? 0}</span></div>
                <div>{t('dashboard:runtime.last24hSuccessFail')}：<span className="font-semibold">{dashboard?.runtime.operations.last24hSucceeded ?? 0} / {dashboard?.runtime.operations.last24hFailed ?? 0}</span></div>
                <div>{t('dashboard:runtime.last7dSuccessFail')}：<span className="font-semibold">{dashboard?.runtime.operations.last7dSucceeded ?? 0} / {dashboard?.runtime.operations.last7dFailed ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.operations.recent.map(operation => (
                  <div key={operation.id} className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{operation.title}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{operation.type} · {formatDateTime(operation.updatedAt)}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(operation.status === 'FAILED' ? 'FAILED' : operation.status)}`}>{getStatusText(t, operation.status)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('dashboard:runtime.hostAgentHealth')}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.hostAgentHealthDesc')}</div>
                </div>
                <Link to="/host-agents" className="text-xs text-[hsl(var(--primary))]">{t('common:buttons.viewAll')}</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>{t('dashboard:runtime.online')}：<span className="font-semibold">{dashboard?.runtime.hostAgents.online ?? 0}</span></div>
                <div>{t('dashboard:runtime.degraded')}：<span className="font-semibold">{dashboard?.runtime.hostAgents.degraded ?? 0}</span></div>
                <div>{t('dashboard:runtime.offline')}：<span className="font-semibold">{dashboard?.runtime.hostAgents.offline ?? 0}</span></div>
                <div>{t('dashboard:runtime.heartbeatAnomalies')}：<span className="font-semibold">{dashboard?.runtime.hostAgents.recentHeartbeatAnomalies ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.hostAgents.recentAnomalies.length ? dashboard.runtime.hostAgents.recentAnomalies.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{agent.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{agent.lastHeartbeatAt ? formatDateTime(agent.lastHeartbeatAt) : t('dashboard:runtime.neverHeartbeat')}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(agent.status)}`}>{getStatusText(t, agent.status)}</span>
                  </div>
                )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.noHeartbeatAnomalies')}</div>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('dashboard:runtime.deploymentStatus')}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.deploymentStatusDesc')}</div>
                </div>
                <Link to="/deployments" className="text-xs text-[hsl(var(--primary))]">{t('common:buttons.viewAll')}</Link>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>{t('dashboard:runtime.healthy')}：<span className="font-semibold">{dashboard?.runtime.deployments.healthy ?? 0}</span></div>
                <div>{t('dashboard:runtime.degraded')}：<span className="font-semibold">{dashboard?.runtime.deployments.degraded ?? 0}</span></div>
                <div>{t('dashboard:runtime.unreachable')}：<span className="font-semibold">{dashboard?.runtime.deployments.unreachable ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.deployments.recentJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{job.targetName}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{job.type} · {formatDateTime(job.createdAt)}</div>
                    </div>
                     <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(job.status === 'FAILED' ? 'FAILED' : job.status)}`}>{getStatusText(t, job.status)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('dashboard:runtime.autoRemediationSnapshot')}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.autoRemediationSnapshotDesc')}</div>
                </div>
                <Link to="/operations" className="text-xs text-[hsl(var(--primary))]">{t('dashboard:runtime.viewChain')}</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>{t('dashboard:runtime.todayTotal')}：<span className="font-semibold">{dashboard?.runtime.remediation.todayTotal ?? 0}</span></div>
                <div>{t('dashboard:runtime.running')}：<span className="font-semibold">{dashboard?.runtime.remediation.running ?? 0}</span></div>
                <div>{t('dashboard:runtime.blocked')}：<span className="font-semibold">{dashboard?.runtime.remediation.blocked ?? 0}</span></div>
                <div>{t('dashboard:runtime.failedSucceeded')}：<span className="font-semibold">{dashboard?.runtime.remediation.failed ?? 0} / {dashboard?.runtime.remediation.succeeded ?? 0}</span></div>
              </div>
              <div className="space-y-2">
                {dashboard?.runtime.remediation.recent.length ? dashboard.runtime.remediation.recent.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-[hsl(var(--foreground))]">{item.title}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateTime(item.updatedAt)}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(item.status === 'FAILED' ? 'FAILED' : item.status)}`}>{getStatusText(t, item.status)}</span>
                  </div>
                )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:runtime.noRemediationRecords')}</div>}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-3">
                {t('dashboard:runtime.criticalEventsTrend', {
                  events24h: dashboard?.runtime.trends.criticalEvents24h ?? 0,
                  events7d: dashboard?.runtime.trends.criticalEvents7d ?? 0
                })}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <SectionCard title={t('dashboard:sections.pendingActions')} description={t('dashboard:sections.pendingActionsDesc')}>
          <div data-testid="dashboard-pending-actions" className="space-y-3">
            {dashboard?.pendingActions.length ? dashboard.pendingActions.map(item => (
              <button
                key={item.id}
                data-testid={`dashboard-pending-action-${item.id}`}
                type="button"
                onClick={() => setSelectedActionId(item.id)}
                className="w-full rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 text-left shadow-sm transition-colors hover:bg-[hsl(var(--accent)_/_0.62)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-2.5 py-1 text-xs">{getPendingActionLabel(t, item.actionType)}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.workspaceName}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{item.title}</div>
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.summary}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-[hsl(var(--foreground))]">{getStatusText(t, item.status)}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{formatDateTime(item.createdAt)}</div>
                  </div>
                </div>
              </button>
            )) : <div data-testid="dashboard-pending-actions-empty" className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:pendingActions.empty')}</div>}
          </div>
        </SectionCard>

        <SectionCard title={t('dashboard:sections.activityFeedPreview')} description={t('dashboard:sections.activityFeedPreviewDesc')}>
          <div data-testid="dashboard-activity-feed-preview" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-3 shadow-sm sm:grid-cols-3">
              <ThemeSelect
                data-testid="dashboard-activity-severity-filter"
                value={activitySeverity}
                onChange={(event) => setActivitySeverity(event.target.value)}
                fieldSize="lg"
                fieldShape="pill"
                className="min-w-[14rem]"
              >
                <option value="">{t('dashboard:activityFeed.allSeverity')}</option>
                <option value="INFO">{getSeverityText(t, 'INFO')}</option>
                <option value="WARN">{getSeverityText(t, 'WARN')}</option>
                <option value="ERROR">{getSeverityText(t, 'ERROR')}</option>
                <option value="CRITICAL">{getSeverityText(t, 'CRITICAL')}</option>
              </ThemeSelect>
              <ThemeInput
                data-testid="dashboard-activity-source-filter"
                value={activitySourceType}
                onChange={(event) => setActivitySourceType(event.target.value)}
                placeholder={t('dashboard:activityFeed.sourceTypePlaceholder')}
                fieldSize="lg"
                fieldShape="pill"
                className="min-w-[14rem]"
              />
              <button
                data-testid="dashboard-activity-apply-filter"
                type="button"
                onClick={() => void refreshAll()}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.7)] px-4 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors duration-200 hover:bg-[hsl(var(--accent))]"
              >
                {t('dashboard:activityFeed.applyFilter')}
              </button>
            </div>

            <div className="space-y-3">
              {dashboard?.activityPreview.length ? dashboard.activityPreview.map(item => (
                <button
                  key={item.id}
                  data-testid={`dashboard-activity-item-${item.id}`}
                  type="button"
                  onClick={() => setSelectedActivityId(item.id)}
                  className="w-full rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 text-left shadow-sm transition-colors hover:bg-[hsl(var(--accent)_/_0.62)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(item.severity)}`}>{getSeverityText(t, item.severity)}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.sourceType}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.workspaceName}</span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{item.title}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.summary}</div>
                      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.targetName ? `${item.targetName} · ` : ''}{formatDateTime(item.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-[hsl(var(--google-blue)_/_0.14)] bg-[hsl(var(--google-blue)_/_0.08)] px-3 py-1 text-xs font-medium text-[hsl(var(--google-blue))]">{t('dashboard:activityFeed.viewFullStream')}</div>
                  </div>
                </button>
              )) : <div data-testid="dashboard-activity-empty" className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:activityFeed.empty')}</div>}
            </div>
          </div>
        </SectionCard>
      </div>



      {/* Critical Issues Drawer */}
      <Drawer
        isOpen={!!selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        title={t('dashboard:drawer.criticalIssueDetails')}
        activeId={selectedIssueId}
        subtitle={selectedIssueId ? `ID: ${selectedIssueId.slice(0, 8)}` : undefined}
      >
        {selectedIssueId && dashboard?.criticalIssues && (() => {
          const issue = dashboard.criticalIssues.find(i => i.id === selectedIssueId)
          if (!issue) return <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.issueNotFound')}</div>
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-4 shadow-sm" data-testid="drawer-issue-summary">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.issueSummary')}</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{issue.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.issueType')}</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{getIssueTypeLabel(t, issue.issueType)}</div>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.severity')}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(issue.severity)}`}>{getSeverityText(t, issue.severity)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.relatedInfo')}</div>
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
                    <span className="text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.lastOccurred')}:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(issue.lastOccurredAt)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--google-blue)_/_0.12)] bg-[hsl(var(--google-blue)_/_0.08)] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.nextSteps')}</div>
                <div className="space-y-2">
                  {issue.actions.map(action => (
                    <button
                      key={`${issue.id}-${action.label}`}
                      type="button"
                      onClick={() => {
                        setSelectedIssueId(null)
                     navigate(withWorkspaceContext(action.route))
                      }}
                      className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
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
        title={t('dashboard:drawer.pendingActionDetails')}
        activeId={selectedActionId}
        subtitle={selectedActionId ? `ID: ${selectedActionId.slice(0, 8)}` : undefined}
      >
        {selectedActionId && dashboard?.pendingActions && (() => {
          const action = dashboard.pendingActions.find(a => a.id === selectedActionId)
          if (!action) return <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.actionNotFound')}</div>
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-4 shadow-sm" data-testid="drawer-action-summary">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.actionTitle')}</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{action.title}</div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.actionDescription')}</div>
                <div className="text-sm text-[hsl(var(--foreground))]">{action.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.actionType')}</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{getPendingActionLabel(t, action.actionType)}</div>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.currentStatus')}</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{getStatusText(t, action.status)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.relatedInfo')}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Workspace:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{action.workspaceName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.createdAt')}:</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{formatDateTime(action.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--google-blue)_/_0.12)] bg-[hsl(var(--google-blue)_/_0.08)] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.navigateToModule')}</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActionId(null)
                    navigate(withWorkspaceContext(action.route))
                  }}
                  className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  data-testid="drawer-action-navigate"
                >
                  {t('dashboard:drawer.goToHandle')}
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
        title={t('dashboard:drawer.activityEventDetails')}
        activeId={selectedActivityId}
        subtitle={selectedActivityId ? `ID: ${selectedActivityId.slice(0, 8)}` : undefined}
      >
        {selectedActivityId && dashboard?.activityPreview && (() => {
          const activity = dashboard.activityPreview.find(a => a.id === selectedActivityId)
          if (!activity) return <div className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.activityNotFound')}</div>
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.56)] p-4 shadow-sm" data-testid="drawer-activity-summary">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.eventTitle')}</div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{activity.title}</div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.eventSummary')}</div>
                <div className="text-sm text-[hsl(var(--foreground))]">{activity.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.severity')}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs border ${getSeverityBadgeClass(activity.severity)}`}>{getSeverityText(t, activity.severity)}</span>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('dashboard:drawer.eventType')}</div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{activity.eventType}</div>
                </div>
              </div>

              <div className="rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--card))] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.relatedInfo')}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.sourceType')}:</span>
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
                    <span className="text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.occurredAt')}:</span>
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

              <div className="rounded-lg border border-[hsl(var(--google-blue)_/_0.12)] bg-[hsl(var(--google-blue)_/_0.08)] p-4 shadow-sm">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t('dashboard:drawer.viewFullEventStream')}</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityId(null)
                    navigate(withWorkspaceContext('/activity-feed'))
                  }}
                  className="w-full rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  data-testid="drawer-activity-navigate"
                >
                  {t('dashboard:drawer.goToActivityFeed')}
                </button>
              </div>
            </div>
          )
        })()}
      </Drawer>
      </main>
    </div>
  )
}
