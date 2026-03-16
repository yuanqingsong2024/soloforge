import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface AlertItem {
  id: string
  workspaceId: string
  targetId?: string | null
  sourceCheckId?: string | null
  severity: string
  status: 'OPEN' | 'ACKED' | 'RESOLVED' | string
  title: string
  summary: string
  dedupeKey: string
  traceId?: string | null
  createdAt: string
  updatedAt: string
}

interface OperationResult {
  id: string
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

function badgeClass(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'ACKED':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'RESOLVED':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200'
  }
}

export function AlertsPage() {
  const navigate = useNavigate()
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [filters, setFilters] = useState({
    workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    status: '',
    severity: ''
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchAlerts(port)
      setLoading(false)
    })
  }, [])

  const fetchAlerts = async (port: number, nextFilters = filters) => {
    const params = new URLSearchParams()
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) params.append(key, value)
    })

    const response = await fetch(`http://127.0.0.1:${port}/api/alerts?${params.toString()}`)
    const json = await response.json() as ApiResponse<AlertItem[]>
    if (!json.success) {
      throw new Error(json.error)
    }
    setAlerts(json.data)
  }

  const openCount = useMemo(() => alerts.filter(alert => alert.status === 'OPEN').length, [alerts])

  const updateStatus = async (alertId: string, status: 'ACKED' | 'RESOLVED') => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/alerts/${alertId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    await fetchAlerts(apiPort)
  }

  const createOperation = async (alertId: string) => {
    if (!apiPort) return
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/alerts/${alertId}/create-operation`, {
      method: 'POST'
    })
    const json = await response.json() as ApiResponse<OperationResult>
    if (!json.success) {
      alert(json.error)
      return
    }
    navigate('/operations')
  }

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Alerts 中...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Alerts"
        description="集中处理巡检发现的未解决问题，支持确认、解决与一键生成修复 Operation"
        actions={
          <button onClick={() => apiPort && fetchAlerts(apiPort)} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
            刷新 Alerts
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard className="!p-0">
          <div className="px-6 py-5">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">未解决 Alerts</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{openCount}</div>
          </div>
        </SectionCard>
        <SectionCard className="!p-0">
          <div className="px-6 py-5">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">总 Alerts</div>
            <div className="mt-2 text-3xl font-bold text-[hsl(var(--foreground))]">{alerts.length}</div>
          </div>
        </SectionCard>
        <SectionCard className="!p-0">
          <div className="px-6 py-5">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">当前 Workspace</div>
            <div className="mt-2 text-xs font-mono text-[hsl(var(--foreground))] break-all">{filters.workspaceId}</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="过滤器">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} placeholder="Workspace ID" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} placeholder="状态，如 OPEN" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.severity} onChange={e => setFilters(prev => ({ ...prev, severity: e.target.value }))} placeholder="严重级别，如 ERROR" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
        </div>
        <div className="mt-3">
          <button onClick={() => apiPort && fetchAlerts(apiPort)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">应用筛选</button>
        </div>
      </SectionCard>

      <SectionCard title={`Alert 列表 (${alerts.length})`} description="同一问题按 dedupeKey 去重，避免刷屏">
        <div className="space-y-3">
          {alerts.map(alertItem => (
            <div key={alertItem.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-4 bg-[hsl(var(--background))]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full border text-xs ${badgeClass(alertItem.status)}`}>{alertItem.status}</span>
                    <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{alertItem.severity}</span>
                    {alertItem.traceId && <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{alertItem.traceId}</span>}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[hsl(var(--foreground))]">{alertItem.title}</div>
                  <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{alertItem.summary}</div>
                  <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] flex gap-3 flex-wrap">
                    <span>Workspace: {alertItem.workspaceId}</span>
                    {alertItem.targetId && <span>Target: {alertItem.targetId}</span>}
                    <span>Dedupe: {alertItem.dedupeKey}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {alertItem.status === 'OPEN' && (
                    <button onClick={() => updateStatus(alertItem.id, 'ACKED')} className="px-3 py-1 text-xs rounded-workshop-md bg-amber-500 text-white hover:opacity-90">
                      ACK
                    </button>
                  )}
                  {alertItem.status !== 'RESOLVED' && (
                    <button onClick={() => updateStatus(alertItem.id, 'RESOLVED')} className="px-3 py-1 text-xs rounded-workshop-md bg-emerald-600 text-white hover:opacity-90">
                      标记已解决
                    </button>
                  )}
                  <button onClick={() => createOperation(alertItem.id)} className="px-3 py-1 text-xs rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                    生成修复 Operation
                  </button>
                </div>
              </div>
            </div>
          ))}
          {alerts.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前筛选条件下暂无 Alert。</div>}
        </div>
      </SectionCard>
    </div>
  )
}
