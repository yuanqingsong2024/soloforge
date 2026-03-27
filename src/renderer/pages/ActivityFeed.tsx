import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'

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

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

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

export function ActivityFeed() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filters, setFilters] = useState({
    workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    targetId: '',
    severity: '',
    sourceType: '',
    eventType: '',
    traceId: '',
    startAt: '',
    endAt: ''
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await Promise.all([fetchEvents(port), fetchWorkspaces(port)])
      setLoading(false)
    })
  }, [])

  const { lastEventPollAt } = useEventDrivenRefresh({
    apiPort,
    workspaceId: filters.workspaceId,
    targetId: filters.targetId || undefined,
    enabled: Boolean(autoRefresh && apiPort),
    sourceTypes: filters.sourceType ? [filters.sourceType] : ['DEPLOYMENT_JOB', 'HOST_AGENT', 'CHANGE_REQUEST', 'BACKUP', 'COMMUNICATION', 'SYSTEM'],
    onRelevantEvent: async () => {
      if (!apiPort) return
      await fetchEvents(apiPort)
    }
  })

  const fetchWorkspaces = async (port: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/workspaces`)
    const data = await response.json() as Workspace[]
    setWorkspaces(Array.isArray(data) ? data : [])
  }

  const fetchEvents = async (port: number, nextFilters = filters) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.append(key, value)
    }
    params.append('limit', '200')

    const response = await fetch(`http://127.0.0.1:${port}/api/event-records?${params.toString()}`)
    const json = await response.json() as ApiResponse<EventRecord[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setEvents(json.data)
  }

  const handleApplyFilters = async () => {
    if (!apiPort) return
    setLoading(true)
    try {
      await fetchEvents(apiPort)
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
        navigate('/doctor')
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
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载活动流中...</div>
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
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded border-[hsl(var(--border))]"
              />
              <span>事件驱动自动刷新</span>
            </label>
            <button
              onClick={handleApplyFilters}
              className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              刷新事件流
            </button>
          </div>
        }
      />

      <SectionCard title="过滤器" description="按 Workspace / Target / Severity / Source / Event Type / Time Range / Trace 查看事件流">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
          <input value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder="Target ID" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <select value={filters.severity} onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">
            <option value="">全部严重级别</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <input value={filters.sourceType} onChange={e => setFilters(prev => ({ ...prev, sourceType: e.target.value }))} placeholder="Source Type" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input value={filters.eventType} onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))} placeholder="Event Type" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input value={filters.traceId} onChange={e => setFilters(prev => ({ ...prev, traceId: e.target.value }))} placeholder="Trace ID" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input type="datetime-local" value={filters.startAt} onChange={e => setFilters(prev => ({ ...prev, startAt: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input type="datetime-local" value={filters.endAt} onChange={e => setFilters(prev => ({ ...prev, endAt: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
        </div>
        <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          {lastEventPollAt ? `最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : '尚未进行事件检查'}
        </div>
      </SectionCard>

      <div>
        <SectionCard title={`事件流 (${events.length})`} description="按时间倒序展示，支持查看 Trace 及反向跳转来源模块">
          <div className="space-y-3">
            {events.map(event => (
              <div key={event.id} className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2.5 py-1 text-xs border ${severityClass(event.severity)}`}>{event.severity}</span>
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
                      <span>{new Date(event.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {event.traceId && (
                      <button onClick={() => navigate(`/traces/${encodeURIComponent(event.traceId || '')}`)} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.62)] px-3 py-1.5 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]">
                        查看链路
                      </button>
                    )}
                    <button onClick={() => handleJump(event)} className="rounded-full bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90">
                      跳转来源
                    </button>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))]">展开 Payload</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-workshop-lg border border-[hsl(var(--border)_/_0.8)] bg-[hsl(var(--muted)_/_0.52)] p-3 text-xs font-mono">{formatJson(event.payload)}</pre>
                </details>
              </div>
            ))}
            {events.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前筛选条件下暂无事件。</div>}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
