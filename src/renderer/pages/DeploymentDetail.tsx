import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PendingApprovalNotice } from '../components/ui/PendingApprovalNotice'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'
import { translateEnum } from '../lib/i18n-helpers'
import { ThemeCheckbox } from '../components/ui/FormFields'

interface DeploymentTarget {
  id: string
  workspaceId: string
  name: string
  targetType: string
  connectionMode: string
  host?: string
  port?: number
  sshUser?: string
  sshPort?: number
  gatewayUrl?: string
  dockerEnabled: boolean
  tailscaleEnabled: boolean
  envType: string
  status: string
  lastCheckAt?: string
  metadata: string
  createdAt: string
  updatedAt: string
}

interface DeploymentJob {
  id: string
  targetId: string
  type: string
  status: string
  traceId: string
  requestJson: string
  resultJson?: string | null
  logs?: string | null
  attempts?: number
  nextRetryAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

interface HealthCheckResult {
  healthy: boolean
  message?: string
  details?: Record<string, unknown>
}

interface HostAgentSummary {
  id: string
  name: string
  status: string
  lastHeartbeatAt?: string | null
}

interface UpgradePlanSummary {
  id: string
  component: string
  currentVersion: string
  targetVersion: string
  status: string
  riskLevel: string
  updatedAt: string
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

type TabType = 'overview' | 'service' | 'logs' | 'jobs'

interface ParsedDeploymentJobResult {
  actionId?: string
  hostAgentId?: string
  dispatch?: string
  reason?: string
  status?: string
  errorSummary?: string
}

interface PendingApprovalNotice {
  action: 'start' | 'stop' | 'restart' | 'upgrade'
  approvalId: string
}

function parseJobResult(raw?: string | null): string {
  if (!raw) return '-'
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.errorSummary === 'string' && parsed.errorSummary) return parsed.errorSummary
    if (typeof parsed.status === 'string') return `状态：${parsed.status}`
    return JSON.stringify(parsed)
  } catch {
    return raw
  }
}

function parseDeploymentJobResult(raw?: string | null): ParsedDeploymentJobResult | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ParsedDeploymentJobResult
  } catch {
    return null
  }
}

export function DeploymentDetail() {
  const { t } = useTranslation(['common', 'deployment'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [target, setTarget] = useState<DeploymentTarget | null>(null)
  const [jobs, setJobs] = useState<DeploymentJob[]>([])
  const [hostAgents, setHostAgents] = useState<HostAgentSummary[]>([])
  const [upgradePlans, setUpgradePlans] = useState<UpgradePlanSummary[]>([])
  const [logs, setLogs] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalNotice | null>(null)
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false)
  const [autoRefreshJobs, setAutoRefreshJobs] = useState(true)
  const [lastJobsRefreshAt, setLastJobsRefreshAt] = useState<string | null>(null)
  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      if (id) {
        fetchTarget(port, id)
        fetchJobs(port, id)
      }
    })
  }, [id])

  useEffect(() => {
    if (autoRefreshLogs && apiPort && id && activeTab === 'logs') {
      const interval = setInterval(() => {
        fetchLogs(apiPort, id)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefreshLogs, apiPort, id, activeTab])

  const hasActiveInstallJob = jobs.some(job => job.type === 'OPENCLAW_BOOTSTRAP_INSTALL' && job.status === 'RUNNING')

  const { lastEventPollAt } = useEventDrivenRefresh({
    apiPort,
    targetId: id,
    enabled: Boolean(autoRefreshJobs && activeTab === 'jobs' && hasActiveInstallJob),
    hasActiveWork: hasActiveInstallJob,
    onRelevantEvent: async () => {
      if (!apiPort || !id) return
      await Promise.all([fetchJobs(apiPort, id), fetchTarget(apiPort, id)])
    }
  })

  const fetchTarget = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets/${targetId}`)
      if (!response.ok) {
        throw new Error('获取部署目标失败')
      }
      const data = await response.json()
      setTarget(data)
      await Promise.all([fetchHostAgents(port, targetId), fetchUpgradePlans(port, data.workspaceId, targetId)])
    } catch (err) {
      console.error('Failed to fetch target:', err)
      setError(err instanceof Error ? err.message : '获取部署目标失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchHostAgents = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/host-agents?targetId=${encodeURIComponent(targetId)}`)
      const json = await response.json() as ApiResponse<HostAgentSummary[]>
      if (json.success) {
        setHostAgents(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch host agents:', err)
    }
  }

  const fetchUpgradePlans = async (port: number, workspaceId: string, targetId: string) => {
    try {
      const params = new URLSearchParams({ workspaceId, targetId })
      const response = await fetch(`http://127.0.0.1:${port}/api/upgrade-plans?${params.toString()}`)
      const json = await response.json() as ApiResponse<UpgradePlanSummary[]>
      if (json.success) {
        setUpgradePlans(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch upgrade plans:', err)
    }
  }

  const fetchJobs = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-jobs?targetId=${targetId}`)
      if (!response.ok) {
        throw new Error('获取作业历史失败')
      }
      const data = await response.json()
      setJobs(data)
      setLastJobsRefreshAt(new Date().toISOString())
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }

  const fetchLogs = async (port: number, targetId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deployment-targets/${targetId}/logs?lines=100`)
      if (!response.ok) {
        throw new Error('获取日志失败')
      }
      const data = await response.json()
      setLogs(data.logs || '暂无日志')
    } catch (err) {
      console.error('Failed to fetch logs:', err)
      setLogs('获取日志失败')
    }
  }

  const handleServiceAction = async (action: 'start' | 'stop' | 'restart' | 'upgrade') => {
    if (!apiPort || !id) return

    setActionLoading(action)
    setPendingApproval(null)
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const result = await response.json()

      if (result.status === 'pending_approval') {
        setPendingApproval({ action, approvalId: result.approvalId })
        return
      }

      if (!response.ok) {
        throw new Error(result.message || `${action} 操作失败`)
      }

      alert(`${action} 操作成功`)
      if (id) {
        fetchTarget(apiPort, id)
        fetchJobs(apiPort, id)
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err)
      alert(err instanceof Error ? err.message : `${action} 操作失败`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleHealthCheck = async () => {
    if (!apiPort || !id) return

    setActionLoading('health')
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/deployment-targets/${id}/health`)
      const result: HealthCheckResult = await response.json()

      if (result.healthy) {
        alert(`健康检查通过\n\n${result.message || '服务运行正常'}`)
      } else {
        alert(`健康检查失败\n\n${result.message || '服务不可达'}`)
      }

      if (id) {
        fetchTarget(apiPort, id)
      }
    } catch (err) {
      console.error('Health check failed:', err)
      alert('健康检查失败')
    } finally {
      setActionLoading(null)
    }
  }

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deployment-${id}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="部署详情" description="加载部署详情中..." />
        <LoadingState message="加载部署详情中..." />
      </div>
    )
  }

  if (error || !target) {
    return (
      <div className="space-y-6">
        <PageHeader title="部署详情" description="加载失败" />
        <EmptyState message={error || '部署目标不存在'} tone="danger" />
      </div>
    )
  }

  const relatedActionIds = Array.from(new Set(jobs.map(job => parseDeploymentJobResult(job.resultJson)?.actionId).filter(Boolean) as string[]))
  const relatedHostAgentIds = Array.from(new Set(jobs.map(job => parseDeploymentJobResult(job.resultJson)?.hostAgentId).filter(Boolean) as string[]))
  const failedJobs = jobs.filter(job => job.status === 'FAILED').length
  const runningJobs = jobs.filter(job => job.status === 'RUNNING' || job.status === 'PENDING').length
  const onlineAgents = hostAgents.filter(agent => agent.status === 'ONLINE').length
  const pendingUpgradePlans = upgradePlans.filter(plan => plan.status === 'DRAFT' || plan.status === 'READY' || plan.status === 'PENDING_APPROVAL' || plan.status === 'APPROVED').length
  const latestTraceId = jobs[0]?.traceId

  const lifecycleItems = [
    {
      id: 'target-created',
      title: '部署目标已创建',
      subtitle: `${target.targetType} · ${target.envType}`,
      timestamp: target.createdAt,
      tone: 'bg-[hsl(var(--google-blue))]'
    },
    ...jobs.map(job => ({
      id: job.id,
      title: job.type,
      subtitle: job.status,
      timestamp: job.updatedAt || job.createdAt,
      tone:
        job.status === 'SUCCEEDED'
          ? 'bg-[hsl(var(--success))]'
          : job.status === 'FAILED'
            ? 'bg-[hsl(var(--destructive))]'
            : job.status === 'RUNNING'
              ? 'bg-[hsl(var(--google-blue))]'
              : 'bg-[hsl(var(--muted-foreground))]'
    })),
    ...(target.lastCheckAt
      ? [{
          id: 'last-health-check',
          title: '最近健康检查',
          subtitle: target.status,
          timestamp: target.lastCheckAt,
          tone: target.status === 'HEALTHY' ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--google-yellow))]'
        }]
      : [])
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const renderRelatedBox = (
    title: string,
    count: number,
    emptyText: string,
    items: Array<{ id: string; label: string }>,
    routePrefix: string
  ) => (
    <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{count}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.map(item => (
          <Link key={item.id} to={`${routePrefix}/${item.id}`} className="block text-sm text-[hsl(var(--google-blue))] hover:underline">
            {item.label}
          </Link>
        )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">{emptyText}</div>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={target.name}
        description={`部署类型: ${target.targetType} | 环境: ${target.envType}`}
        actions={
          <button
            onClick={() => navigate('/deployments')}
            className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
          >
            返回列表
          </button>
        }
      />

      {pendingApproval && (
        <PendingApprovalNotice
          title={t('deployment:approval.inlineTitle')}
          description={t('deployment:approval.inlinePending', { action: t(`deployment:actions.${pendingApproval.action}`), approvalId: pendingApproval.approvalId })}
          primaryActionLabel={t('deployment:approval.goToApprovals')}
          secondaryActionLabel={t('deployment:approval.dismiss')}
          onPrimaryAction={() => navigate('/approvals')}
          onSecondaryAction={() => setPendingApproval(null)}
        />
      )}

      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-5 shadow-workshop-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('deployment:detail.environmentConsole')}</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t('deployment:detail.environmentConsoleDesc')}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleHealthCheck}
              disabled={actionLoading !== null}
              className="rounded-full bg-[hsl(var(--primary))] px-4 py-2 text-xs font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === 'health' ? t('deployment:detail.checking') : t('deployment:actions.health')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('logs')
                if (apiPort && id) fetchLogs(apiPort, id)
              }}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              {t('deployment:actions.logs')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Link to="/health-monitoring" className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('deployment:detail.health')}</div>
            <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">{translateEnum(t, 'deploymentStatusMap', target.status)}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{target.lastCheckAt ? new Date(target.lastCheckAt).toLocaleString('zh-CN') : t('deployment:never')}</div>
          </Link>

          <Link to={`/host-agents?workspaceId=${target.workspaceId}&targetId=${target.id}`} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('deployment:detail.hostAgents')}</div>
            <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">{onlineAgents}/{hostAgents.length}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{t('deployment:detail.onlineTotal')}</div>
          </Link>

          <Link to={`/operations?workspaceId=${target.workspaceId}&targetId=${target.id}`} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 text-left transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('deployment:detail.operations')}</div>
            <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">{runningJobs}/{jobs.length}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{failedJobs > 0 ? t('deployment:detail.failedJobs', { count: failedJobs }) : t('deployment:detail.noFailedJobs')}</div>
          </Link>

          <Link to={`/upgrade-plans?workspaceId=${target.workspaceId}&targetId=${target.id}`} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('deployment:detail.releases')}</div>
            <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">{pendingUpgradePlans}/{upgradePlans.length}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{t('deployment:detail.pendingTotal')}</div>
          </Link>

          <Link to={latestTraceId ? `/audit?traceId=${encodeURIComponent(latestTraceId)}` : '/audit'} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('deployment:detail.audit')}</div>
            <div className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">{t('deployment:detail.traceChain')}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{t('deployment:detail.auditDesc')}</div>
          </Link>
        </div>
      </div>

      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-5 shadow-workshop-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('deployment:detail.relatedOverview')}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t('deployment:detail.relatedOverviewDesc')}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderRelatedBox(t('deployment:detail.relatedJobs'), jobs.length, t('deployment:detail.noRelatedJobs'), jobs.slice(0, 5).map(job => ({ id: job.id, label: `${job.type} · ${translateEnum(t, 'operationStatusMap', job.status)}` })), '/deployment-jobs')}
          {renderRelatedBox(t('deployment:detail.relatedAgentActions'), relatedActionIds.length, t('deployment:detail.noRelatedAgentActions'), relatedActionIds.map(id => ({ id, label: id })), '/agent-actions')}
          {renderRelatedBox(t('deployment:detail.relatedHostAgents'), relatedHostAgentIds.length, t('deployment:detail.noRelatedHostAgents'), relatedHostAgentIds.map(id => ({ id, label: id })), '/host-agents')}
        </div>
      </div>

      <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-5 shadow-workshop-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">部署生命周期时间线</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">按时间顺序概览部署目标创建、作业推进和健康检查。</div>
        </div>
        <div className="relative pl-4 space-y-5 before:absolute before:inset-y-2 before:left-[11px] before:w-px before:bg-[hsl(var(--border))]">
          {lifecycleItems.map(item => (
            <div key={item.id} className="relative pl-6">
              <span className={`absolute left-[-5px] top-1.5 h-2 w-2 rounded-full ring-4 ring-[hsl(var(--background))] ${item.tone}`} />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</div>
                  <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{item.subtitle}</div>
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(item.timestamp).toLocaleString('zh-CN')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-hidden rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
        <div className="border-b border-[hsl(var(--border))]">
          <nav className="flex flex-wrap gap-2 px-4 py-3" aria-label="Tabs">
            {[
              { id: 'overview', label: '概览' },
              { id: 'service', label: '服务管理' },
              { id: 'logs', label: '日志' },
              { id: 'jobs', label: '作业历史' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as TabType)
                  if (tab.id === 'logs' && apiPort && id) {
                    fetchLogs(apiPort, id)
                  }
                }}
                className={`
                  rounded-full px-4 py-2.5 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))] shadow-workshop-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    名称
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    类型
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.targetType}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    连接模式
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.connectionMode}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    环境
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.envType}</p>
                </div>
                {target.host && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        主机
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.host}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        端口
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.port || 18789}</p>
                    </div>
                  </>
                )}
                {target.sshUser && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        SSH 用户
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.sshUser}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                        SSH 端口
                      </label>
                      <p className="text-[hsl(var(--foreground))]">{target.sshPort || 22}</p>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    状态
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.status}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    最后检查
                  </label>
                  <p className="text-[hsl(var(--foreground))]">
                    {target.lastCheckAt ? new Date(target.lastCheckAt).toLocaleString('zh-CN') : '从未'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    Docker 启用
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.dockerEnabled ? '是' : '否'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    Tailscale 启用
                  </label>
                  <p className="text-[hsl(var(--foreground))]">{target.tailscaleEnabled ? '是' : '否'}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">
                    创建时间
                  </label>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(target.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Service Management Tab */}
          {activeTab === 'service' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleServiceAction('start')}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] px-4 py-3 text-sm font-medium text-[hsl(var(--success))] transition-colors hover:bg-[hsl(var(--google-green)_/_0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'start' ? '启动中...' : '启动服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('stop')}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-4 py-3 text-sm font-medium text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--google-red)_/_0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'stop' ? '停止中...' : '停止服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('restart')}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] px-4 py-3 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--google-yellow)_/_0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'restart' ? '重启中...' : '重启服务'}
                </button>
                <button
                  onClick={() => handleServiceAction('upgrade')}
                  disabled={actionLoading !== null}
                  className="rounded-full border border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.12)] px-4 py-3 text-sm font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--google-blue)_/_0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'upgrade' ? '升级中...' : '升级服务'}
                </button>
                <button
                  onClick={handleHealthCheck}
                  disabled={actionLoading !== null}
                  className="col-span-2 rounded-full bg-[hsl(var(--primary))] px-4 py-3 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition-opacity"
                >
                  {actionLoading === 'health' ? '检查中...' : '健康检查'}
                </button>
              </div>

              {target.envType === 'PROD' && (
                <div className="rounded-workshop-lg border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.16)] p-4 shadow-workshop-sm">
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    <strong>注意：</strong>此部署目标为生产环境，服务管理操作需要审批。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
                <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2">
                    <ThemeCheckbox checked={autoRefreshLogs} onChange={(e) => setAutoRefreshLogs(e.target.checked)} />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">自动刷新（5秒）</span>
                  </label>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => apiPort && id && fetchLogs(apiPort, id)}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    刷新
                  </button>
                  <button
                    onClick={downloadLogs}
                    className="rounded-full bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  >
                    下载日志
                  </button>
                </div>
              </div>
              <pre className="h-96 overflow-x-auto overflow-y-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(224_24%_10%)] p-4 font-mono text-xs text-[hsl(var(--google-green))] shadow-workshop-sm">
                {logs}
              </pre>
            </div>
          )}

          {/* Jobs History Tab */}
          {activeTab === 'jobs' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">安装作业监控</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {lastJobsRefreshAt ? `最近刷新：${new Date(lastJobsRefreshAt).toLocaleTimeString('zh-CN')}` : '尚未刷新'}
                    {lastEventPollAt ? ` · 最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2">
                    <ThemeCheckbox checked={autoRefreshJobs} onChange={(e) => setAutoRefreshJobs(e.target.checked)} />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">运行中自动刷新</span>
                  </label>
                  <button
                    onClick={() => apiPort && id && fetchJobs(apiPort, id)}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    刷新作业
                  </button>
                </div>
              </div>

              {jobs.length === 0 ? (
                <EmptyState message="暂无作业历史" className="py-8" />
              ) : (
                 <div className="overflow-x-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
                   <table className="w-full">
                     <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.56)]">
                       <tr>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                           作业类型
                         </th>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                          状态
                        </th>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                          开始时间
                        </th>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                          完成时间
                        </th>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                           错误信息
                         </th>
                         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                           执行摘要
                         </th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {jobs.map(job => {
                        const parsedResult = parseDeploymentJobResult(job.resultJson)
                        return (
                          <tr key={job.id} className="transition-colors hover:bg-[hsl(var(--accent)_/_0.5)]">
                           <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))]">
                             <div className="space-y-1">
                               <Link to={`/deployment-jobs/${job.id}`} className="text-[hsl(var(--google-blue))] hover:underline">{job.type}</Link>
                               {job.type === 'OPENCLAW_BOOTSTRAP_INSTALL' && (
                                 <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border border-[hsl(var(--google-blue)_/_0.18)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]">
                                  OpenClaw 安装引导
                                </span>
                              )}
                            </div>
                           </td>
                          <td className="px-4 py-3 text-sm">
                              <StatusBadge
                                label={translateEnum(t, 'operationStatusMap', job.status)}
                                tone={job.status === 'SUCCEEDED' ? 'success' : job.status === 'FAILED' ? 'danger' : job.status === 'RUNNING' ? 'info' : 'muted'}
                                className="px-2.5 py-1"
                              />
                          </td>
                          <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                            {job.updatedAt ? new Date(job.updatedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                            {job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED' ? new Date(job.updatedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                           <td className="px-4 py-3 text-sm text-[hsl(var(--destructive))]">
                            {job.lastError || parseJobResult(job.resultJson)}
                           </td>
                           <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] align-top">
                            {parsedResult ? (
                              <div className="space-y-1">
                                {parsedResult.dispatch && <div>分派方式：{parsedResult.dispatch}</div>}
                                 {parsedResult.actionId && <div className="font-mono text-xs break-all">Action: <Link to={`/agent-actions/${parsedResult.actionId}`} className="text-[hsl(var(--google-blue))] hover:underline">{parsedResult.actionId}</Link></div>}
                                 {parsedResult.hostAgentId && <div className="font-mono text-xs break-all">Agent: <Link to={`/host-agents/${parsedResult.hostAgentId}`} className="text-[hsl(var(--google-blue))] hover:underline">{parsedResult.hostAgentId}</Link></div>}
                                {parsedResult.reason && <div>{parsedResult.reason}</div>}
                                {parsedResult.errorSummary && <div className="text-[hsl(var(--destructive))]">{parsedResult.errorSummary}</div>}
                              </div>
                            ) : (
                              <span>-</span>
                            )}
                           </td>
                         </tr>
                        )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
