import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiResponse } from '../lib/api'
import { readWorkspaceId } from '../lib/storage'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'
import { ThemeCheckbox, ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { translateEnum } from '../lib/i18n-helpers'

interface Workspace {
  id: string
  name: string
}

interface EventRecord {
  id: string
  workspaceId: string
  targetId?: string | null
  sourceType: string
  sourceId: string
  eventType: string
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | string
  title: string
  summary: string
  payload: unknown
  traceId?: string | null
  createdAt: string
}

function severityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'border-[hsl(var(--google-red)_/_0.24)] bg-[hsl(var(--google-red)_/_0.16)] text-[hsl(var(--destructive))]'
    case 'ERROR':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    case 'WARN':
      return 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]'
    default:
      return 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
  }
}

  function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function renderEventCard(
  event: EventRecord,
  navigate: ReturnType<typeof useNavigate>,
  handleJump: (event: EventRecord) => void,
  formatSeverity: (severity: string) => string
) {
  return (
    <div key={event.id} className="rounded-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2.5 py-1 text-xs border ${severityClass(event.severity)}`}>{formatSeverity(event.severity)}</span>
            <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{event.sourceType}</span>
            <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{event.eventType}</span>
            {event.traceId && <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{event.traceId}</span>}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{event.title}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{event.summary}</p>
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] flex gap-3 flex-wrap">
            <span>Workspace: {event.workspaceId}</span>
            {event.targetId && <span>Target: {event.targetId}</span>}
            <span>{formatDateTime(event.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {event.traceId && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/traces/${encodeURIComponent(event.traceId || '')}`)}>
              查看链路
            </Button>
          )}
          <Button size="sm" onClick={() => handleJump(event)}>
            跳转来源
          </Button>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))]">展开 Payload</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] p-3 text-xs font-mono">{formatJson(event.payload)}</pre>
      </details>
    </div>
  )
}

export function ActivityFeed() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filters, setFilters] = useState({
    workspaceId: readWorkspaceId(),
    targetId: '',
    severity: '',
    sourceType: '',
    eventType: '',
    traceId: '',
    startAt: '',
    endAt: ''
  })

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchEvents(), fetchWorkspaces()])
      setLoading(false)
    }
    void init()
  }, [])

  const { lastEventPollAt } = useEventDrivenRefresh({
    workspaceId: filters.workspaceId,
    targetId: filters.targetId || undefined,
    enabled: Boolean(autoRefresh),
    sourceTypes: filters.sourceType ? [filters.sourceType] : ['DEPLOYMENT_JOB', 'HOST_AGENT', 'CHANGE_REQUEST', 'BACKUP', 'COMMUNICATION', 'SYSTEM'],
    onRelevantEvent: async () => {
      await fetchEvents()
    }
  })

  const fetchWorkspaces = async () => {
    const data = await apiFetch<Workspace[]>('/api/workspaces')
    setWorkspaces(Array.isArray(data) ? data : [])
  }

  const fetchEvents = async (nextFilters = filters) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.append(key, value)
    }
    params.append('limit', '200')

    const json = await apiFetch<ApiResponse<EventRecord[]>>(`/api/event-records?${params.toString()}`)
    if (!json.success) {
      throw new Error(json.error)
    }
    setEvents(json.data ?? [])
  }

  const handleApplyFilters = async () => {
    setLoading(true)
    try {
      await fetchEvents()
    } finally {
      setLoading(false)
    }
  }

  const handleJump = (event: EventRecord) => {
    switch (event.sourceType) {
      case 'CHANGE_REQUEST':
        navigate('/changes')
        return
      case 'DEPLOYMENT_JOB':
        if (event.targetId) {
          navigate(`/deployments/${event.targetId}`)
          return
        }
        navigate('/deployments')
        return
      case 'DOCTOR':
        navigate('/health-monitoring?tab=doctor')
        return
      case 'BACKUP':
        navigate('/backup')
        return
      case 'COMMUNICATION':
        navigate('/outbound-messages')
        return
      default:
        navigate('/')
    }
  }

  if (loading) {
    return <LoadingState message="加载活动流中..." />
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Activity Feed"
        description="统一查看配置、巡检、部署、恢复、通知等运行态事件链路"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/investigation-timeline')}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            >
              打开调查时间线
            </button>
            <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              <ThemeCheckbox checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              <span>事件驱动自动刷新</span>
            </label>
            <Button onClick={handleApplyFilters}>
              刷新事件流
            </Button>
          </div>
        }
      />

      <SectionCard title="过滤器" description="按 Workspace / Target / Severity / Source / Event Type / Time Range / Trace 查看事件流">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ThemeSelect value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} fieldSize="lg" fieldShape="pill">
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </ThemeSelect>
          <ThemeInput value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder="Target ID" fieldSize="lg" fieldShape="pill" />
          <ThemeSelect value={filters.severity} onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value }))} fieldSize="lg" fieldShape="pill">
            <option value="">全部严重级别</option>
            <option value="INFO">{translateEnum(t, 'severityMap', 'INFO')}</option>
            <option value="WARN">{translateEnum(t, 'severityMap', 'WARN')}</option>
            <option value="ERROR">{translateEnum(t, 'severityMap', 'ERROR')}</option>
            <option value="CRITICAL">{translateEnum(t, 'severityMap', 'CRITICAL')}</option>
          </ThemeSelect>
          <ThemeInput value={filters.sourceType} onChange={e => setFilters(prev => ({ ...prev, sourceType: e.target.value }))} placeholder="Source Type" fieldSize="lg" fieldShape="pill" />
          <ThemeInput value={filters.eventType} onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))} placeholder="Event Type" fieldSize="lg" fieldShape="pill" />
          <ThemeInput value={filters.traceId} onChange={e => setFilters(prev => ({ ...prev, traceId: e.target.value }))} placeholder="Trace ID" fieldSize="lg" fieldShape="pill" />
          <ThemeInput type="datetime-local" value={filters.startAt} onChange={e => setFilters(prev => ({ ...prev, startAt: e.target.value }))} fieldSize="lg" fieldShape="pill" />
          <ThemeInput type="datetime-local" value={filters.endAt} onChange={e => setFilters(prev => ({ ...prev, endAt: e.target.value }))} fieldSize="lg" fieldShape="pill" />
        </div>
        <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          {lastEventPollAt ? `最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : '尚未进行事件检查'}
        </div>
      </SectionCard>

      <div>
          <SectionCard title={`事件流 (${events.length})`} description="按时间倒序展示，支持查看 Trace 及反向跳转来源模块">
            <div className="space-y-3">
              {events.map(event => renderEventCard(event, navigate, handleJump, (severity) => translateEnum(t, 'severityMap', severity)))}
            {events.length === 0 && <EmptyState message="当前筛选条件下暂无事件。" />}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
