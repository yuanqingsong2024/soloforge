import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'

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

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

function statusClass(status: string): string {
  switch (status) {
    case 'SUCCEEDED':
      return 'border-[hsl(var(--google-green)_/_0.18)] bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--success))]'
    case 'FAILED':
      return 'border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--destructive))]'
    case 'RUNNING':
      return 'border-[hsl(var(--google-blue)_/_0.16)] bg-[hsl(var(--google-blue)_/_0.12)] text-[hsl(var(--google-blue))]'
    case 'WAITING_APPROVAL':
      return 'border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.2)] text-[hsl(var(--foreground))]'
    default:
      return 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
  }
}

export function OperationsPage() {
  const location = useLocation()
  const initialFilters = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      workspaceId: params.get('workspaceId') || localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
      targetId: params.get('targetId') || '',
      status: params.get('status') || '',
      type: params.get('type') || ''
    }
  }, [location.search])

  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [operations, setOperations] = useState<Operation[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<string>('')
  const [filters, setFilters] = useState(initialFilters)

  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchOperations(port, initialFilters)
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
      await fetchOperations(apiPort, filters)
    }
  })

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

  const selectedOperation = useMemo(
    () => operations.find(operation => operation.id === selectedOperationId) || null,
    [operations, selectedOperationId]
  )

  const startOperation = async (operationId: string) => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/operations/${operationId}/start`, {
      method: 'POST'
    })
    await fetchOperations(apiPort)
  }

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Operations 中...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Jobs / Operations"
        description="以 Phase / Step 展示部署、升级、恢复、巡检修复等分层操作结构"
        actions={
          <div className="flex items-center gap-3">
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
              onClick={() => apiPort && fetchOperations(apiPort)}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
            >
              刷新 Operations
            </button>
          </div>
        }
      />

      <SectionCard title="筛选器" description="按 Workspace / Target / 状态 / 类型过滤运行态操作">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={filters.workspaceId} onChange={e => setFilters(prev => ({ ...prev, workspaceId: e.target.value }))} placeholder="Workspace ID" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.targetId} onChange={e => setFilters(prev => ({ ...prev, targetId: e.target.value }))} placeholder="Target ID" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} placeholder="状态，如 RUNNING" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
          <input value={filters.type} onChange={e => setFilters(prev => ({ ...prev, type: e.target.value }))} placeholder="类型，如 UPGRADE" className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" />
        </div>
        <div className="mt-3">
          <button onClick={() => apiPort && fetchOperations(apiPort)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
            应用筛选
          </button>
        </div>
        <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          {lastEventPollAt ? `最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : '尚未进行事件检查'}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)] gap-6">
        <SectionCard title={`Operations (${operations.length})`} description="左侧快速查看当前 Workspace 的层级操作实例">
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
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{operation.summary || '暂无摘要'}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2 font-mono">{operation.traceId}</div>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${statusClass(operation.status)}`}>{operation.status}</span>
                </div>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] flex gap-3 flex-wrap">
                  <span>{operation.type}</span>
                  {operation.targetId && <span>Target: {operation.targetId}</span>}
                  <span>{new Date(operation.updatedAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    to={`/operations/${operation.id}`}
                    className="rounded-full px-3 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    查看详情
                  </Link>
                </div>
              </button>
            ))}
            {operations.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前没有 Operations 记录。后续 Alerts / Deployments / Restore 会逐步汇入这里。</div>}
          </div>
        </SectionCard>

        <SectionCard
          title={selectedOperation ? selectedOperation.title || selectedOperation.type : 'Operation 详情'}
          description={selectedOperation ? `${selectedOperation.type} · ${selectedOperation.status}` : '请选择左侧 Operation 查看概览'}
          actions={selectedOperation ? (
            <div className="flex items-center gap-2">
              {selectedOperation.status === 'PENDING' && (
                <button onClick={() => startOperation(selectedOperation.id)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                  启动 Operation
                </button>
              )}
              <Link to={`/operations/${selectedOperation.id}`} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
                查看完整详情
              </Link>
            </div>
          ) : undefined}
        >
          {!selectedOperation ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">请选择左侧 Operation。</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">Workspace</div>
                  <div className="font-mono text-[hsl(var(--foreground))]">{selectedOperation.workspaceId}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted-foreground))]">Target</div>
                  <div className="font-mono text-[hsl(var(--foreground))]">{selectedOperation.targetId || '—'}</div>
                </div>
              </div>

              <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))] mb-3">执行摘要</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Phase 数量</div>
                    <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{selectedOperation.phases.length}</div>
                  </div>
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Step 数量</div>
                    <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{selectedOperation.phases.reduce((total, phase) => total + phase.steps.length, 0)}</div>
                  </div>
                  <div className="rounded-workshop-md bg-[hsl(var(--muted))] px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">最近更新时间</div>
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
                      <div className="font-semibold text-[hsl(var(--foreground))]">Phase {phase.orderNo}: {phase.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {phase.startedAt ? `开始：${new Date(phase.startedAt).toLocaleString('zh-CN')}` : '未开始'}
                        {phase.endedAt ? ` · 结束：${new Date(phase.endedAt).toLocaleString('zh-CN')}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${statusClass(phase.status)}`}>{phase.status}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 py-4 bg-[hsl(var(--background))] text-sm">
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">步骤总数</div>
                      <div className="font-semibold text-[hsl(var(--foreground))]">{totalSteps}</div>
                    </div>
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">已完成</div>
                      <div className="font-semibold text-[hsl(var(--foreground))]">{completedSteps}</div>
                    </div>
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))]">待处理</div>
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
