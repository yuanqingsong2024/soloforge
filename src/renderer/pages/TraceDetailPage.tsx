import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { EventGroupCard } from '../components/investigation/EventGroupCard'
import { EventRecord } from '../components/investigation/types'
import { translateEnum } from '../lib/i18n-helpers'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function eventObjectLabel(event: EventRecord): string {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {}

  if (event.sourceType === 'CHANGE_REQUEST') {
    const status = typeof payload.status === 'string' ? ` · ${payload.status}` : ''
    return `${event.summary || event.title || event.sourceId}${status}`
  }

  if (event.sourceType === 'DEPLOYMENT_JOB') {
    const targetName = typeof payload.targetName === 'string' ? payload.targetName : null
    const status = typeof payload.status === 'string' ? payload.status : null
    return [targetName || event.title || event.sourceId, status].filter(Boolean).join(' · ')
  }

  if (event.sourceType === 'HOST_AGENT') {
    const name = typeof payload.name === 'string' ? payload.name : null
    const status = typeof payload.status === 'string' ? payload.status : null
    return [name || event.summary || event.title || event.sourceId, status].filter(Boolean).join(' · ')
  }

  if (event.sourceType === 'ALERT') {
    return [event.title || event.sourceId, event.severity].filter(Boolean).join(' · ')
  }

  if (event.sourceType === 'SYSTEM') {
    const type = typeof payload.type === 'string' ? payload.type : null
    return [event.title || event.sourceId, type].filter(Boolean).join(' · ')
  }

  return event.title || event.sourceId
}

export function TraceDetailPage() {
  const { t } = useTranslation('common')
  const { traceId = '' } = useParams<{ traceId: string }>()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const port = await getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/event-records/trace/${encodeURIComponent(traceId)}`)
        const json = await response.json() as ApiResponse<EventRecord[]>
        if (!response.ok || !json.success) {
          throw new Error(json.success ? '获取 Trace 详情失败' : json.error)
        }
        setEvents(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取 Trace 详情失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [traceId])

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
      case 'ALERT':
        navigate(`/alerts/${event.sourceId}`)
        return
      case 'SYSTEM':
        navigate('/operations')
        return
      default:
        navigate('/activity-feed')
    }
  }

  if (loading) {
    return <LoadingState message="加载 Trace 详情中..." />
  }

  if (error) {
    return <EmptyState message={error} tone="danger" />
  }

  const operationCount = new Set(events.filter(event => event.sourceType === 'SYSTEM').map(event => event.sourceId)).size
  const deploymentJobCount = new Set(events.filter(event => event.sourceType === 'DEPLOYMENT_JOB').map(event => event.sourceId)).size
  const alertCount = new Set(events.filter(event => event.sourceType === 'ALERT').map(event => event.sourceId)).size
  const hostAgentCount = new Set(events.filter(event => event.sourceType === 'HOST_AGENT').map(event => event.sourceId)).size

  const operationIds = Array.from(new Set(events.filter(event => event.sourceType === 'SYSTEM').map(event => event.sourceId)))
  const deploymentJobIds = Array.from(new Set(events.filter(event => event.sourceType === 'DEPLOYMENT_JOB').map(event => event.sourceId)))
  const alertIds = Array.from(new Set(events.filter(event => event.sourceType === 'ALERT').map(event => event.sourceId)))
  const hostAgentIds = Array.from(new Set(events.filter(event => event.sourceType === 'HOST_AGENT').map(event => event.sourceId)))

  const jumpToSummaryTarget = (type: 'operations' | 'jobs' | 'alerts' | 'agents') => {
    if (type === 'operations') {
      if (operationIds.length === 1) {
        navigate(`/operations/${operationIds[0]}`)
        return
      }
      navigate('/operations')
      return
    }

    if (type === 'jobs') {
      if (deploymentJobIds.length === 1) {
        navigate(`/deployment-jobs/${deploymentJobIds[0]}`)
        return
      }
      navigate('/deployments')
      return
    }

    if (type === 'alerts') {
      if (alertIds.length === 1) {
        navigate(`/alerts/${alertIds[0]}`)
        return
      }
      navigate('/alerts?status=OPEN')
      return
    }

    if (hostAgentIds.length === 1) {
      navigate(`/host-agents/${hostAgentIds[0]}`)
      return
    }
    navigate('/host-agents')
  }

  const summaryPreview = (items: string[]) => {
    if (items.length === 0) return '无关联对象'
    if (items.length <= 2) return items.join(' · ')
    return `${items.slice(0, 2).join(' · ')} 等 ${items.length} 个对象`
  }

  const latestObjectLabels = (sourceType: string) => {
    const latestByObject = new Map<string, EventRecord>()
    const sorted = [...events]
      .filter(event => event.sourceType === sourceType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    for (const event of sorted) {
      if (!latestByObject.has(event.sourceId)) {
        latestByObject.set(event.sourceId, event)
      }
    }

    return Array.from(latestByObject.values()).slice(0, 2).map(eventObjectLabel)
  }

  const groupedBySourceType = Array.from(events.reduce((map, event) => {
    const bucket = map.get(event.sourceType) || []
    bucket.push(event)
    map.set(event.sourceType, bucket)
    return map
  }, new Map<string, EventRecord[]>()).entries())

  const toggleGroup = (sourceType: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [sourceType]: !prev[sourceType]
    }))
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="链路详情"
        description={traceId}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/investigation-timeline" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
              返回调查时间线
            </Link>
            <Link to="/activity-feed" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              返回事件流
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SectionCard className="!p-0">
          <button type="button" onClick={() => jumpToSummaryTarget('operations')} className="w-full px-6 py-5 text-left transition-colors hover:bg-[hsl(var(--accent))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">关联操作</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{operationCount}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{summaryPreview(latestObjectLabels('SYSTEM'))}</div>
          </button>
        </SectionCard>
        <SectionCard className="!p-0">
          <button type="button" onClick={() => jumpToSummaryTarget('jobs')} className="w-full px-6 py-5 text-left transition-colors hover:bg-[hsl(var(--accent))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">关联部署任务</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{deploymentJobCount}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{summaryPreview(latestObjectLabels('DEPLOYMENT_JOB'))}</div>
          </button>
        </SectionCard>
        <SectionCard className="!p-0">
          <button type="button" onClick={() => jumpToSummaryTarget('alerts')} className="w-full px-6 py-5 text-left transition-colors hover:bg-[hsl(var(--accent))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">关联告警</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{alertCount}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{summaryPreview(latestObjectLabels('ALERT'))}</div>
          </button>
        </SectionCard>
        <SectionCard className="!p-0">
          <button type="button" onClick={() => jumpToSummaryTarget('agents')} className="w-full px-6 py-5 text-left transition-colors hover:bg-[hsl(var(--accent))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">关联宿主机 Agent</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{hostAgentCount}</div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{summaryPreview(latestObjectLabels('HOST_AGENT'))}</div>
          </button>
        </SectionCard>
      </div>

      <SectionCard title={`Trace 事件 (${events.length})`} description="按时间顺序查看该 Trace 下的完整对象链和事件载荷。">
        <div className="space-y-4">
          {groupedBySourceType.map(([sourceType, sourceEvents]) => {
            const uniqueObjectCount = new Set(sourceEvents.map(event => event.sourceId)).size
            const groupKey = sourceType
            const isCollapsed = collapsedGroups[groupKey] ?? false
            return (
              <EventGroupCard
                key={groupKey}
                title={sourceType}
                subtitle={`${uniqueObjectCount} 个对象 · ${sourceEvents.length} 条事件`}
                groupKey={groupKey}
                collapsed={isCollapsed}
                onToggle={toggleGroup}
                events={sourceEvents}
                getSummaryEntries={(event) => {
                  const preview = eventObjectLabel(event)
                  return preview && preview !== event.title ? [{ label: '对象', value: preview }] : []
                }}
                onJump={handleJump}
                renderPayload={(event) => formatJson(event.payload)}
                formatSeverity={(severity) => translateEnum(t, 'severityMap', severity)}
              />
            )
          })}
          {events.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前 Trace 没有事件。</div>}
        </div>
      </SectionCard>
    </div>
  )
}
