import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ThemeCheckbox, ThemeInput } from '../components/ui/FormFields'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'
import { readWorkspaceId } from '../lib/storage'

interface OperationStep {
  id: string
  name: string
  stepType: string
  status: string
  requestJson: string
  resultJson?: string | null
  logs?: string | null
  deploymentJobId?: string | null
  changeRequestId?: string | null
  alertId?: string | null
  startedAt?: string | null
  endedAt?: string | null
}

interface OperationPhase {
  id: string
  name: string
  orderNo: number
  status: string
  startedAt?: string | null
  endedAt?: string | null
  steps: OperationStep[]
}

interface Operation {
  id: string
  workspaceId: string
  targetId?: string | null
  type: string
  status: string
  traceId: string
  title: string
  summary: string
  createdAt: string
  updatedAt: string
  phases: OperationPhase[]
}

interface JobRecord {
  id: string
  workspaceId: string
  ticketId?: string | null
  type: string
  status: string
  traceId: string
  createdAt: string
  updatedAt: string
}

interface DeploymentJobRecord {
  id: string
  workspaceId: string
  targetId: string
  type: string
  status: string
  traceId: string
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

interface AgentActionRecord {
  id: string
  workspaceId: string
  targetId: string
  hostAgentId: string
  actionType: string
  status: string
  traceId: string
  errorSummary?: string | null
  createdAt: string
  updatedAt: string
}

interface OutboxEventRecord {
  id: string
  workspaceId: string
  kind: string
  status: string
  traceId: string
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

type UnifiedTaskSource = 'operation' | 'job' | 'deploymentJob' | 'agentAction' | 'outbox'

interface UnifiedTask {
  id: string
  source: UnifiedTaskSource
  title: string
  summary: string
  status: string
  traceId?: string | null
  targetId?: string | null
  updatedAt: string
  route?: string
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

function toUnifiedStatus(status: string): 'running' | 'blocked' | 'attention' | 'completed' | 'queued' {
  switch (status) {
    case 'RUNNING':
    case 'SENDING':
    case 'DISPATCHED':
    case 'ACKED':
      return 'running'
    case 'FAILED':
    case 'BLOCKED':
    case 'TIMEOUT':
      return 'blocked'
    case 'WAITING_APPROVAL':
    case 'PENDING_APPROVAL':
    case 'PENDING':
    case 'DRAFT':
    case 'READY':
      return 'attention'
    case 'SUCCEEDED':
    case 'SENT':
    case 'APPLIED':
    case 'RESOLVED':
    case 'APPROVED':
      return 'completed'
    default:
      return 'queued'
  }
}

function getUnifiedStatusLabel(t: (key: string) => string, status: string): string {
  return t(`operations:statusGroups.${toUnifiedStatus(status)}`)
}

function getStatusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'muted' {
  switch (status) {
    case 'SUCCEEDED':
      return 'success'
    case 'FAILED':
    case 'BLOCKED':
    case 'TIMEOUT':
      return 'danger'
    case 'RUNNING':
    case 'DISPATCHED':
    case 'ACKED':
      return 'info'
    case 'WAITING_APPROVAL':
    case 'PENDING':
    case 'PENDING_APPROVAL':
      return 'warning'
    default:
      return 'muted'
  }
}

export function OperationsPage() {
  const { t } = useTranslation(['common', 'operations'])
  const location = useLocation()
  const initialFilters = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      workspaceId: params.get('workspaceId') || readWorkspaceId(),
      targetId: params.get('targetId') || '',
      status: params.get('status') || '',
      type: params.get('type') || ''
    }
  }, [location.search])

  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [operations, setOperations] = useState<Operation[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [deploymentJobs, setDeploymentJobs] = useState<DeploymentJobRecord[]>([])
  const [agentActions, setAgentActions] = useState<AgentActionRecord[]>([])
  const [outboxEvents, setOutboxEvents] = useState<OutboxEventRecord[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<string>('')
  const [filters, setFilters] = useState(initialFilters)

  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await Promise.all([fetchOperations(port, initialFilters), fetchUnifiedTaskSources(port, initialFilters)])
      setLoading(false)
    })
  }, [initialFilters])

  const { lastEventPollAt } = useEventDrivenRefresh({
    apiPort,
    workspaceId: filters.workspaceId,
    targetId: filters.targetId || undefined,
    enabled: Boolean(autoRefresh && apiPort),
    hasActiveWork: operations.some(operation => operation.status === 'RUNNING' || operation.status === 'PENDING' || operation.status === 'WAITING_APPROVAL'),
    sourceTypes: ['DEPLOYMENT_JOB', 'HOST_AGENT', 'SYSTEM'],
    onRelevantEvent: async () => {
      if (!apiPort) return
      await Promise.all([fetchOperations(apiPort, filters), fetchUnifiedTaskSources(apiPort, filters)])
    }
  })

  const unifiedTasks = useMemo<UnifiedTask[]>(() => {
    const workspaceId = filters.workspaceId
    const targetId = filters.targetId
    const matches = (workspace?: string | null, target?: string | null) => {
      if (workspaceId && workspace && workspace !== workspaceId) return false
      if (targetId && target && target !== targetId) return false
      if (targetId && !target) return false
      return true
    }

    return [
      ...operations.map(operation => ({
        id: operation.id,
        source: 'operation' as const,
        title: operation.title || operation.type,
        summary: operation.summary || t('operations:taskSources.operation'),
        status: operation.status,
        traceId: operation.traceId,
        targetId: operation.targetId,
        updatedAt: operation.updatedAt,
        route: `/operations/${operation.id}`
      })),
      ...jobs.filter(job => matches(job.workspaceId, null)).map(job => ({
        id: job.id,
        source: 'job' as const,
        title: job.type,
        summary: job.ticketId ? `Ticket: ${job.ticketId}` : t('operations:taskSources.job'),
        status: job.status,
        traceId: job.traceId,
        updatedAt: job.updatedAt,
        route: undefined
      })),
      ...deploymentJobs.filter(job => matches(job.workspaceId, job.targetId)).map(job => ({
        id: job.id,
        source: 'deploymentJob' as const,
        title: job.type,
        summary: job.lastError || t('operations:taskSources.deploymentJob'),
        status: job.status,
        traceId: job.traceId,
        targetId: job.targetId,
        updatedAt: job.updatedAt,
        route: `/deployment-jobs/${job.id}`
      })),
      ...agentActions.filter(action => matches(action.workspaceId, action.targetId)).map(action => ({
        id: action.id,
        source: 'agentAction' as const,
        title: action.actionType,
        summary: action.errorSummary || `Host Agent: ${action.hostAgentId}`,
        status: action.status,
        traceId: action.traceId,
        targetId: action.targetId,
        updatedAt: action.updatedAt,
        route: `/agent-actions/${action.id}`
      })),
      ...outboxEvents.filter(event => matches(event.workspaceId, null)).map(event => ({
        id: event.id,
        source: 'outbox' as const,
        title: event.kind,
        summary: event.lastError || t('operations:taskSources.outbox'),
        status: event.status,
        traceId: event.traceId,
        updatedAt: event.updatedAt,
        route: '/outbox'
      }))
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 80)
  }, [agentActions, deploymentJobs, filters.targetId, filters.workspaceId, jobs, operations, outboxEvents, t])

  const unifiedSummary = useMemo(() => {
    return unifiedTasks.reduce((summary, task) => {
      const status = toUnifiedStatus(task.status)
      summary.total += 1
      summary[status] += 1
      return summary
    }, { total: 0, running: 0, blocked: 0, attention: 0, completed: 0, queued: 0 })
  }, [unifiedTasks])

  const fetchOperations = async (port: number, nextFilters = filters) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.append(key, value)
    }

    const response = await fetch(`http://127.0.0.1:${port}/api/operations?${params.toString()}`)
    const json = await response.json() as ApiResponse<Operation[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setOperations(json.data)
    if (!selectedOperationId && json.data.length > 0) {
      setSelectedOperationId(json.data[0].id)
    }
  }

  const fetchUnifiedTaskSources = async (port: number, nextFilters = filters) => {
    const readOk = async <T,>(url: string): Promise<T[]> => {
      try {
        const response = await fetch(url)
        const json = await response.json() as ApiResponse<T[]> | T[]
        if (Array.isArray(json)) return json
        return json.success ? json.data : []
      } catch (error) {
        console.warn('Failed to fetch unified task source:', error)
        return []
      }
    }

    const jobItems = await readOk<JobRecord>(`http://127.0.0.1:${port}/api/jobs`)
    const deploymentJobParams = new URLSearchParams()
    if (nextFilters.workspaceId) deploymentJobParams.set('workspaceId', nextFilters.workspaceId)
    if (nextFilters.targetId) deploymentJobParams.set('targetId', nextFilters.targetId)
    const deploymentJobItems = await readOk<DeploymentJobRecord>(`http://127.0.0.1:${port}/api/deployment-jobs?${deploymentJobParams.toString()}`)
    const agentActionParams = new URLSearchParams()
    if (nextFilters.workspaceId) agentActionParams.set('workspaceId', nextFilters.workspaceId)
    if (nextFilters.targetId) agentActionParams.set('targetId', nextFilters.targetId)
    const agentActionItems = await readOk<AgentActionRecord>(`http://127.0.0.1:${port}/api/agent-actions?${agentActionParams.toString()}`)
    const outboxItems = await readOk<OutboxEventRecord>(`http://127.0.0.1:${port}/api/outbox`)

    setJobs(jobItems)
    setDeploymentJobs(deploymentJobItems)
    setAgentActions(agentActionItems)
    setOutboxEvents(outboxItems)
  }

  const selectedOperation = useMemo(
    () => operations.find(operation => operation.id === selectedOperationId) || null,
    [operations, selectedOperationId]
  )

  const startOperation = async (operationId: string) => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/operations/${operationId}/start`, {
      method: 'POST'
    })
      await Promise.all([fetchOperations(apiPort), fetchUnifiedTaskSources(apiPort)])
  }

  if (loading) {
    return (
      <div className="p-6">
        <LoadingState message={t('operations:loading')} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
        <PageHeader
        title={t('operations:title')}
        description={t('operations:description')}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              <ThemeCheckbox checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              <span>{t('operations:actions.eventRefresh')}</span>
            </label>
            <button
              onClick={() => apiPort && Promise.all([fetchOperations(apiPort), fetchUnifiedTaskSources(apiPort)])}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
            >
                {t('operations:actions.refresh')}
            </button>
          </div>
        }
      />

      <SectionCard title={t('operations:filters.title')} description={t('operations:filters.description')}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ThemeInput value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} placeholder={t('operations:filters.workspacePlaceholder')} fieldSize="lg" />
          <ThemeInput value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder={t('operations:filters.targetPlaceholder')} fieldSize="lg" />
          <ThemeInput value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} placeholder={t('operations:filters.statusPlaceholder')} fieldSize="lg" />
          <ThemeInput value={filters.type} onChange={e => setFilters(prev => ({ ...prev, type: e.target.value }))} placeholder={t('operations:filters.typePlaceholder')} fieldSize="lg" />
        </div>
        <div className="mt-3">
          <button onClick={() => apiPort && Promise.all([fetchOperations(apiPort), fetchUnifiedTaskSources(apiPort)])} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
            {t('operations:filters.apply')}
          </button>
        </div>
        <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          {lastEventPollAt ? t('operations:filters.lastEventPollAt', { time: new Date(lastEventPollAt).toLocaleTimeString('zh-CN') }) : t('operations:filters.noEventPoll')}
        </div>
      </SectionCard>

      <SectionCard title={t('operations:unified.title')} description={t('operations:unified.description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {(['total', 'running', 'blocked', 'attention', 'completed', 'queued'] as const).map(key => (
            <div key={key} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t(`operations:unified.${key}`)}</div>
              <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{unifiedSummary[key]}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {unifiedTasks.slice(0, 12).map(task => (
            <div key={`${task.source}-${task.id}`} className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-2 py-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{t(`operations:sources.${task.source}`)}</span>
                    <StatusBadge label={getUnifiedStatusLabel(t, task.status)} tone={getStatusTone(task.status)} className="px-2 py-0.5 text-[11px]" />
                  </div>
                  <div className="mt-2 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{task.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{task.summary}</div>
                  {task.traceId && <div className="mt-2 truncate font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{t('operations:labels.traceId')}: {task.traceId}</div>}
                </div>
                {task.route && (
                  <Link to={task.route} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]">
                    {t('common:buttons.view')}
                  </Link>
                )}
              </div>
            </div>
          ))}
          {unifiedTasks.length === 0 && <EmptyState message={t('operations:unified.empty')} />}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)] gap-6">
        <SectionCard title={t('operations:details.listTitle', { count: operations.length })} description={t('operations:details.listDescription')}>
          <div className="space-y-3">
            {operations.map(operation => (
              <button
                key={operation.id}
                onClick={() => setSelectedOperationId(operation.id)}
                className={`w-full text-left border rounded-workshop-md p-4 transition-colors ${selectedOperationId === operation.id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{operation.title || operation.type}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{operation.summary || t('operations:details.noSummary')}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2 font-mono">{t('operations:labels.traceId')}: {operation.traceId}</div>
                  </div>
                  <StatusBadge label={getUnifiedStatusLabel(t, operation.status)} tone={getStatusTone(operation.status)} />
                </div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] flex gap-3 flex-wrap">
                  <span>{operation.type}</span>
                  {operation.targetId && <span>{t('operations:labels.target')}: {operation.targetId}</span>}
                  <span>{new Date(operation.updatedAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    to={`/operations/${operation.id}`}
                    className="rounded-full px-3 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {t('operations:actions.viewDetails')}
                  </Link>
                </div>
              </button>
            ))}
            {operations.length === 0 && <EmptyState message={t('operations:details.empty')} />}
          </div>
        </SectionCard>

        <SectionCard
          title={selectedOperation ? selectedOperation.title || selectedOperation.type : t('operations:details.title')}
          description={selectedOperation ? `${selectedOperation.type} · ${getUnifiedStatusLabel(t, selectedOperation.status)}` : t('operations:details.selectHint')}
          actions={selectedOperation ? (
            <div className="flex items-center gap-2">
              {selectedOperation.status === 'PENDING' && (
                <button onClick={() => startOperation(selectedOperation.id)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                  {t('operations:actions.start')}
                </button>
              )}
              <Link to={`/operations/${selectedOperation.id}`} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                {t('operations:actions.viewFullDetails')}
              </Link>
            </div>
          ) : undefined}
        >
          {!selectedOperation ? (
            <EmptyState message={t('operations:details.selectHint')} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">{t('operations:labels.workspace')}</div>
                  <div className="font-mono text-[hsl(var(--foreground))]">{selectedOperation.workspaceId}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">{t('operations:labels.target')}</div>
                  <div className="font-mono text-[hsl(var(--foreground))]">{selectedOperation.targetId || '—'}</div>
                </div>
              </div>

              <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] mb-3">{t('operations:details.executionSummary')}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('operations:details.phaseCount')}</div>
                    <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{selectedOperation.phases.length}</div>
                  </div>
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('operations:details.stepCount')}</div>
                    <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{selectedOperation.phases.reduce((total, phase) => total + phase.steps.length, 0)}</div>
                  </div>
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{t('operations:details.lastUpdated')}</div>
                    <div className="mt-2 text-sm font-medium text-[hsl(var(--foreground))]">{new Date(selectedOperation.updatedAt).toLocaleString('zh-CN')}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {selectedOperation.phases.map(phase => {
                  const totalSteps = phase.steps.length
                  const completedSteps = phase.steps.filter(step => step.status === 'SUCCEEDED').length
                  const waitingSteps = phase.steps.filter(step => step.status === 'PENDING' || step.status === 'WAITING_APPROVAL').length
                  return (
                <div key={phase.id} className="border border-[hsl(var(--border))] rounded-workshop-md overflow-hidden">
                  <div className="px-4 py-3 bg-[hsl(var(--muted))] flex items-center justify-between gap-3">
                    <div>
                  <div className="font-semibold text-[hsl(var(--foreground))]">{t('operations:details.phaseTitle', { order: phase.orderNo, name: phase.name })}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {phase.startedAt ? t('operations:details.startedAt', { time: new Date(phase.startedAt).toLocaleString('zh-CN') }) : t('operations:details.notStarted')}
                        {phase.endedAt ? ` · ${t('operations:details.endedAt', { time: new Date(phase.endedAt).toLocaleString('zh-CN') })}` : ''}
                      </div>
                    </div>
                    <StatusBadge label={getUnifiedStatusLabel(t, phase.status)} tone={getStatusTone(phase.status)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 py-4 bg-[hsl(var(--background))] text-sm">
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">{t('operations:details.totalSteps')}</div>
                      <div className="font-semibold text-[hsl(var(--foreground))]">{totalSteps}</div>
                    </div>
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">{t('operations:details.completedSteps')}</div>
                      <div className="font-semibold text-[hsl(var(--foreground))]">{completedSteps}</div>
                    </div>
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">{t('operations:details.pendingSteps')}</div>
                      <div className="font-semibold text-[hsl(var(--foreground))]">{waitingSteps}</div>
                    </div>
                  </div>
                </div>
                  )})}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
