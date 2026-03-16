import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

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
      return 'bg-rose-100 text-rose-800 border-rose-300'
    case 'ERROR':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'WARN':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200'
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
  const [traceEvents, setTraceEvents] = useState<EventRecord[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState('')
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

  const fetchTrace = async (traceId: string) => {
    if (!apiPort || !traceId) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/event-records/trace/${encodeURIComponent(traceId)}`)
    const json = await response.json() as ApiResponse<EventRecord[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setSelectedTraceId(traceId)
    setTraceEvents(json.data)
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

  const traceSummary = useMemo(() => {
    if (traceEvents.length === 0) return '未选择 Trace 链路'
    return `${traceEvents.length} 条事件，开始于 ${new Date(traceEvents[0].createdAt).toLocaleString('zh-CN')}`
  }, [traceEvents])

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载活动流中...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Activity Feed"
        description="统一查看配置、巡检、部署、恢复、通知等运行态事件链路"
        actions={
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
          >
            刷新事件流
          </button>
        }
      />

      <SectionCard title="过滤器" description="按 Workspace / Target / Severity / Source / Event Type / Time Range / Trace 查看事件流">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
          <input value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder="Target ID" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <select value={filters.severity} onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value }))} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">全部严重级别</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <input value={filters.sourceType} onChange={e => setFilters(prev => ({ ...prev, sourceType: e.target.value }))} placeholder="Source Type" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.eventType} onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))} placeholder="Event Type" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.traceId} onChange={e => setFilters(prev => ({ ...prev, traceId: e.target.value }))} placeholder="Trace ID" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input type="datetime-local" value={filters.startAt} onChange={e => setFilters(prev => ({ ...prev, startAt: e.target.value }))} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input type="datetime-local" value={filters.endAt} onChange={e => setFilters(prev => ({ ...prev, endAt: e.target.value }))} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6">
        <SectionCard title={`事件流 (${events.length})`} description="按时间倒序展示，支持查看 Trace 及反向跳转来源模块">
          <div className="space-y-3">
            {events.map(event => (
              <div key={event.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--background))]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${severityClass(event.severity)}`}>{event.severity}</span>
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
                      <button onClick={() => fetchTrace(event.traceId || '')} className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                        查看链路
                      </button>
                    )}
                    <button onClick={() => handleJump(event)} className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                      跳转来源
                    </button>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))]">展开 Payload</summary>
                  <pre className="mt-2 text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-64">{formatJson(event.payload)}</pre>
                </details>
              </div>
            ))}
            {events.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前筛选条件下暂无事件。</div>}
          </div>
        </SectionCard>

        <SectionCard title="Trace 链路" description={traceSummary}>
          <div className="space-y-3">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">当前 Trace：{selectedTraceId || '未选择'}</div>
            {traceEvents.map((event, index) => (
              <div key={event.id} className="border-l-2 border-[hsl(var(--border))] pl-3 pb-2">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">#{index + 1} · {new Date(event.createdAt).toLocaleString('zh-CN')}</div>
                <div className="text-sm font-medium text-[hsl(var(--foreground))]">{event.title}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{event.eventType}</div>
              </div>
            ))}
            {traceEvents.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">从左侧事件流选择“查看链路”后，这里会展示完整 Trace。</div>}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
