import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface AlertItem {
  id: string
  workspaceId: string
  targetId?: string | null
  sourceCheckId?: string | null
  severity: string
  status: string
  title: string
  summary: string
  dedupeKey: string
  traceId?: string | null
  createdAt: string
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

export function AlertDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [alert, setAlert] = useState<AlertItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadAlert = async (alertId: string) => {
    const port = await getApiPort()
    const response = await fetch(`http://127.0.0.1:${port}/api/alerts/${alertId}`)
    const json = await response.json() as ApiResponse<AlertItem>
    if (!response.ok || !json.success) {
      throw new Error(json.success ? '获取 Alert 详情失败' : json.error)
    }
    setAlert(json.data)
  }

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('缺少 Alert ID')
        setLoading(false)
        return
      }

      try {
        await loadAlert(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取 Alert 详情失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  const updateStatus = async (status: 'ACKED' | 'RESOLVED') => {
    if (!id) return
    setActionLoading(status)
    try {
      const port = await getApiPort()
      await fetch(`http://127.0.0.1:${port}/api/alerts/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      await loadAlert(id)
    } finally {
      setActionLoading(null)
    }
  }

  const createOperation = async () => {
    if (!id) return
    setActionLoading('CREATE_OPERATION')
    try {
      const port = await getApiPort()
      const response = await fetch(`http://127.0.0.1:${port}/api/alerts/${id}/create-operation`, {
        method: 'POST'
      })
      const json = await response.json() as ApiResponse<{ id: string }>
      if (!json.success) {
        throw new Error(json.error)
      }
      navigate(`/operations/${json.data.id}`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Alert 中...</div>
  }

  if (error || !alert) {
    return <div className="p-6 text-sm text-[hsl(var(--destructive))]">{error || 'Alert 不存在'}</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={alert.title}
        description={`${alert.severity} · ${alert.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/alerts?status=OPEN" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
              返回 Alerts
            </Link>
            {alert.status === 'OPEN' && (
              <button onClick={() => void updateStatus('ACKED')} disabled={actionLoading !== null} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--google-yellow)_/_0.2)] hover:opacity-90 disabled:opacity-50">
                {actionLoading === 'ACKED' ? '处理中...' : 'ACK'}
              </button>
            )}
            {alert.status !== 'RESOLVED' && (
              <button onClick={() => void updateStatus('RESOLVED')} disabled={actionLoading !== null} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--google-green)_/_0.18)] hover:opacity-90 disabled:opacity-50">
                {actionLoading === 'RESOLVED' ? '处理中...' : '标记已解决'}
              </button>
            )}
            <button onClick={() => void createOperation()} disabled={actionLoading !== null} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50">
              {actionLoading === 'CREATE_OPERATION' ? '生成中...' : '生成 Operation'}
            </button>
          </div>
        }
      />

      <SectionCard title="Alert 概览" description="查看当前告警的核心元信息。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Severity</div><div>{alert.severity}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Status</div><div>{alert.status}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono">{alert.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div className="font-mono">{alert.targetId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Trace ID</div><div className="font-mono">{alert.traceId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Dedupe Key</div><div className="font-mono">{alert.dedupeKey}</div></div>
          <div className="md:col-span-2"><div className="text-[hsl(var(--muted-foreground))]">摘要</div><div>{alert.summary}</div></div>
        </div>
      </SectionCard>
    </div>
  )
}
