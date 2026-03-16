import { useEffect, useMemo, useState } from 'react'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

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
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'FAILED':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'RUNNING':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'WAITING_APPROVAL':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200'
  }
}

function parseJsonText(text?: string | null): string {
  if (!text) return '—'
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function OperationsPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [operations, setOperations] = useState<Operation[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<string>('')
  const [filters, setFilters] = useState({
    workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    targetId: '',
    status: '',
    type: ''
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await fetchOperations(port)
      setLoading(false)
    })
  }, [])

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
          <button
            onClick={() => apiPort && fetchOperations(apiPort)}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
          >
            刷新 Operations
          </button>
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
              </button>
            ))}
            {operations.length === 0 && <div className="text-sm text-[hsl(var(--muted-foreground))]">当前没有 Operations 记录。后续 Alerts / Deployments / Restore 会逐步汇入这里。</div>}
          </div>
        </SectionCard>

        <SectionCard
          title={selectedOperation ? selectedOperation.title || selectedOperation.type : 'Operation 详情'}
          description={selectedOperation ? `${selectedOperation.type} · ${selectedOperation.status}` : '请选择左侧 Operation 查看详情'}
          actions={selectedOperation && selectedOperation.status === 'PENDING' ? (
            <button onClick={() => startOperation(selectedOperation.id)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              启动 Operation
            </button>
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

              {selectedOperation.phases.map(phase => (
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
                  <div className="divide-y divide-[hsl(var(--border))]">
                    {phase.steps.map(step => (
                      <details key={step.id} className="group">
                        <summary className="list-none cursor-pointer px-4 py-3 flex items-start justify-between gap-3 hover:bg-[hsl(var(--accent))]">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[hsl(var(--foreground))]">{step.name}</div>
                            <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 flex gap-3 flex-wrap">
                              <span>{step.stepType}</span>
                              {step.deploymentJobId && <span>DeploymentJob: {step.deploymentJobId}</span>}
                              {step.changeRequestId && <span>ChangeRequest: {step.changeRequestId}</span>}
                              {step.alertId && <span>Alert: {step.alertId}</span>}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${statusClass(step.status)}`}>{step.status}</span>
                        </summary>
                        <div className="px-4 pb-4 space-y-3 bg-[hsl(var(--background))]">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">请求</div>
                              <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-56">{parseJsonText(step.requestJson)}</pre>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">结果</div>
                              <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-56">{parseJsonText(step.resultJson)}</pre>
                            </div>
                          </div>
                          {step.logs && (
                            <div>
                              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">日志</div>
                              <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-56 whitespace-pre-wrap">{step.logs}</pre>
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
