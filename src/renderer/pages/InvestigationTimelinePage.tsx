import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { EventRecord } from '../components/investigation/types'
import { eventRowSeverityStyle, severityColor, severityDotColor, sourceTypeColor, SourceTypeIcon, traceCardSeverityStyle } from '../components/investigation/styles'

interface Workspace {
  id: string
  name: string
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

function summaryEntries(event: EventRecord): Array<{ label: string; value: string }> {
  const payload = (event.payload && typeof event.payload === 'object') ? event.payload as Record<string, unknown> : {}

  const entries: Array<{ label: string; value: string }> = []

  if (event.sourceType === 'DEPLOYMENT_JOB') {
    entries.push({ label: 'Job', value: typeof payload.targetName === 'string' ? payload.targetName : (event.title || event.sourceId) })
    if (event.targetId) entries.push({ label: 'Target', value: event.targetId })
    if (typeof payload.status === 'string') entries.push({ label: '状态', value: payload.status })
  } else if (event.sourceType === 'HOST_AGENT') {
    entries.push({ label: 'Agent', value: typeof payload.name === 'string' ? payload.name : (event.summary || event.sourceId) })
    if (event.targetId) entries.push({ label: 'Target', value: event.targetId })
    if (typeof payload.status === 'string') entries.push({ label: '状态', value: payload.status })
  } else if (event.sourceType === 'CHANGE_REQUEST') {
    entries.push({ label: '变更单', value: event.summary || event.sourceId })
    if (typeof payload.status === 'string') entries.push({ label: '状态', value: payload.status })
  } else if (event.sourceType === 'ALERT') {
    entries.push({ label: 'Alert', value: event.title || event.sourceId })
    entries.push({ label: 'Severity', value: event.severity })
    if (event.targetId) entries.push({ label: 'Target', value: event.targetId })
  } else if (event.sourceType === 'SYSTEM') {
    entries.push({ label: 'Operation', value: event.title || event.sourceId })
    if (typeof payload.type === 'string') entries.push({ label: '类型', value: payload.type })
  }

  return entries.slice(0, 3)
}

export function InvestigationTimelinePage() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filters, setFilters] = useState({
    workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    targetId: '',
    severity: '',
    sourceType: '',
    eventType: '',
    traceId: ''
  })
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

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
        navigate(`/changes/${event.sourceId}`)
        return
      case 'DEPLOYMENT_JOB':
        navigate(`/deployment-jobs/${event.sourceId}`)
        return
      case 'HOST_AGENT':
        navigate(`/host-agents/${event.sourceId}`)
        return
      case 'SYSTEM':
        navigate('/operations')
        return
      default:
        navigate('/activity-feed')
    }
  }

  const groupedByTrace = useMemo(() => {
    const groups = new Map<string, EventRecord[]>()
    for (const event of events) {
      const key = event.traceId || `no-trace:${event.id}`
      const bucket = groups.get(key) || []
      bucket.push(event)
      groups.set(key, bucket)
    }
    return Array.from(groups.entries()).map(([traceId, items]) => {
      const highestSeverity = items.some(e => e.severity === 'CRITICAL') ? 'CRITICAL' : items.some(e => e.severity === 'ERROR') ? 'ERROR' : items.some(e => e.severity === 'WARN') ? 'WARN' : 'INFO'
      const sortedItems = items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      const groupedItems = Array.from(sortedItems.reduce((map, item) => {
        const bucket = map.get(item.sourceType) || []
        bucket.push(item)
        map.set(item.sourceType, bucket)
        return map
      }, new Map<string, EventRecord[]>()).entries())
      return {
        traceId,
        highestSeverity,
        items: sortedItems,
        groupedItems
      }
    })
  }, [events])

  const toggleGroup = (traceId: string, sourceType: string) => {
    const key = `${traceId}:${sourceType}`
    setCollapsedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Investigation Timeline 中...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Investigation Timeline"
        description="统一查看跨对象事件轨迹，按 Trace 聚合 Operation / Deployment Job / Host Agent / Alert 链路"
        actions={
          <button onClick={handleApplyFilters} className="rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90">
            刷新时间线
          </button>
        }
      />

      <SectionCard title="过滤器" description="按 Workspace / Target / Severity / Source / Event Type / Trace 过滤调查时间线。">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
          <input value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder="Target ID" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input value={filters.traceId} onChange={e => setFilters(prev => ({ ...prev, traceId: e.target.value }))} placeholder="Trace ID" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input value={filters.sourceType} onChange={e => setFilters(prev => ({ ...prev, sourceType: e.target.value }))} placeholder="Source Type" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <input value={filters.eventType} onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))} placeholder="Event Type" className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]" />
          <select value={filters.severity} onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value }))} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">
            <option value="">全部严重级别</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
      </SectionCard>

      <div>
        <SectionCard title={`Trace 分组 (${groupedByTrace.length})`} description="按 Trace 聚合事件，先看整体链路，再深入单条事件。">
          <div className="space-y-4">
            {groupedByTrace.map(group => (
              <div key={group.traceId} className={`rounded-workshop-lg border p-4 shadow-workshop-sm transition-colors ${traceCardSeverityStyle(group.highestSeverity)}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
                      Trace
                      <span className={`h-2 w-2 rounded-full ${severityDotColor(group.highestSeverity)}`} />
                    </div>
                    <div className="font-mono text-sm text-[hsl(var(--foreground))]">{group.traceId}</div>
                  </div>
                  {!group.traceId.startsWith('no-trace:') && (
                    <button onClick={() => navigate(`/traces/${encodeURIComponent(group.traceId)}`)} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
                      查看完整链路
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {group.groupedItems.map(([sourceType, sourceEvents]) => (
                    (() => {
                      const collapseKey = `${group.traceId}:${sourceType}`
                      const isCollapsed = collapsedGroups[collapseKey] ?? false
                      return (
                     <div key={sourceType} className="rounded-workshop-md border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.28)] p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] border ${sourceTypeColor(sourceType)}`}>
                            <SourceTypeIcon type={sourceType} />
                            <span className="font-mono font-medium">{sourceType}</span>
                          </span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{sourceEvents.length} 条事件</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.traceId, sourceType)}
                          className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background)_/_0.5)] px-3 py-1 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                        >
                          {isCollapsed ? '展开' : '折叠'}
                        </button>
                      </div>

                      {!isCollapsed && (
                      <div className="relative pl-4 space-y-3 before:absolute before:inset-y-2 before:left-[11px] before:w-px before:bg-[hsl(var(--border)_/_0.6)]">
                        {sourceEvents.map(event => (
                          <div key={event.id} className="relative pl-6">
                            <span className={`absolute left-[-5px] top-3 h-2 w-2 rounded-full ring-4 ring-transparent shadow-sm ${severityDotColor(event.severity)}`} />
                            <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-md border ${eventRowSeverityStyle(event.severity)}`}>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border ${severityColor(event.severity)}`}>{event.severity}</span>
                                  <span className="text-[11px] font-mono text-[hsl(var(--muted-foreground))]">{event.eventType}</span>
                                </div>
                                <div className="text-sm font-medium text-[hsl(var(--foreground))]">{event.title}</div>
                                {event.summary && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{event.summary}</div>}
                                {summaryEntries(event).length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {summaryEntries(event).map(item => (
                                      <span key={`${event.id}-${item.label}`} className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.5)] px-2.5 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                                        <span className="uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{item.label}</span>
                                        <span className="font-mono text-[hsl(var(--foreground))]">{item.value}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2 sm:mt-0 opacity-80 hover:opacity-100 transition-opacity">
                                <button onClick={() => handleJump(event)} className="rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--background)_/_0.5)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
                                  来源 &rarr;
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                      )
                    })()
                  ))}
                </div>
              </div>
            ))}
            {groupedByTrace.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前筛选条件下暂无事件。</div>}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
