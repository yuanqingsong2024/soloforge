import { useEffect, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getToneByStatus } from '../lib/status-badge'

interface OutboxEvent {
  id: string
  kind: string
  status: string
  attempts: number
  nextRetryAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiFailResponse {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailResponse

export function OutboxManagement() {
  const [events, setEvents] = useState<OutboxEvent[]>([])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      fetchEvents(port)
    })
  }, [])

  const fetchEvents = async (port: number, status?: string) => {
    try {
      const url = status && status !== 'all'
        ? `http://127.0.0.1:${port}/api/outbox?status=${status}`
        : `http://127.0.0.1:${port}/api/outbox`
      const response = await fetch(url)
      const result = await response.json() as ApiResponse<OutboxEvent[]>

      if (!response.ok || !result.success) {
        throw new Error(result.success ? '获取 Outbox 列表失败' : result.error)
      }

      setEvents(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      console.error('Failed to fetch outbox events:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (eventId: string) => {
    if (!apiPort) return
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/outbox/${eventId}/retry`, {
        method: 'POST'
      })
      alert('重试已提交')
      fetchEvents(apiPort, statusFilter === 'all' ? undefined : statusFilter)
    } catch (error) {
      console.error('Failed to retry event:', error)
      alert('重试失败')
    }
  }

  const handleRetryDue = async () => {
    if (!apiPort || !confirm('确定要批量重试所有到期的事件吗？')) return
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/outbox/retry-due`, {
        method: 'POST'
      })
      const result = await response.json() as ApiResponse<{ retried?: number; processed?: number }>

      if (!response.ok || !result.success) {
        throw new Error(result.success ? '批量重试失败' : result.error)
      }

      const retriedCount = result.data.retried ?? result.data.processed ?? 0
      alert(`已重试 ${retriedCount} 个事件`)
      fetchEvents(apiPort, statusFilter === 'all' ? undefined : statusFilter)
    } catch (error) {
      console.error('Failed to retry due events:', error)
      alert(error instanceof Error ? error.message : '批量重试失败')
    }
  }

  const handleFilterChange = (status: string) => {
    setStatusFilter(status)
    if (apiPort) {
      fetchEvents(apiPort, status === 'all' ? undefined : status)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Outbox 管理" />
        <LoadingState message="加载 Outbox 事件中..." />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader title="Outbox 管理" />
      
      <div className="mb-6 flex gap-4 items-center">
        <select
          value={statusFilter}
          onChange={e => handleFilterChange(e.target.value)}
          className="px-3 py-2 text-sm rounded-workshop-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
        >
          <option value="all">全部状态</option>
          <option value="PENDING">PENDING</option>
          <option value="SENDING">SENDING</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
        </select>

        <button
          onClick={handleRetryDue}
          className="px-4 py-2 bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] rounded-workshop-md hover:opacity-90"
        >
          批量重试到期事件
        </button>
      </div>

      <SectionCard title={`Outbox 事件列表 (${events.length})`}>
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="p-4 border border-[hsl(var(--border))] rounded-workshop-md">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{event.kind}</span>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    创建时间：{new Date(event.createdAt).toLocaleString('zh-CN')}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    尝试次数：{event.attempts}
                  </p>
                  {event.nextRetryAt && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      下次重试：{new Date(event.nextRetryAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
                <StatusBadge label={event.status} tone={getToneByStatus(event.status, { SENDING: 'info', SUCCEEDED: 'success', FAILED: 'danger' })} />
              </div>

              {event.lastError && (
                <div className="mt-2 rounded-workshop-md bg-[hsl(var(--muted))] p-2 text-xs border border-[hsl(var(--border))]">
                  <p className="font-medium text-[hsl(var(--destructive))]">错误信息：</p>
                  <p className="text-[hsl(var(--muted-foreground))] mt-1">{event.lastError}</p>
                </div>
              )}

              {event.status === 'FAILED' && (
                <button
                  onClick={() => handleRetry(event.id)}
                  className="mt-2 px-3 py-1 text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
                >
                  手动重试
                </button>
              )}
            </div>
          ))}

          {events.length === 0 && (
            <EmptyState message="暂无 Outbox 事件" />
          )}
        </div>
      </SectionCard>
    </div>
  )
}
