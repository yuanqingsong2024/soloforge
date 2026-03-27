import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

function statusBgClass(status: string): string {
  switch (status) {
    case 'SUCCEEDED':
      return 'bg-[hsl(var(--success))]'
    case 'FAILED':
      return 'bg-[hsl(var(--destructive))]'
    case 'RUNNING':
      return 'bg-[hsl(var(--google-blue))]'
    case 'WAITING_APPROVAL':
      return 'bg-[hsl(var(--google-yellow))]'
    default:
      return 'bg-[hsl(var(--muted-foreground))]'
  }
}

function formatTimeCompact(time?: string | null): string {
  if (!time) return '—'
  return new Date(time).toLocaleString('zh-CN', { 
    month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
}

function parseJsonText(text?: string | null): string {
  if (!text) return '—'
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function OperationDetail() {
  const { id } = useParams<{ id: string }>()
  const [operation, setOperation] = useState<Operation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('缺少 Operation ID')
        setLoading(false)
        return
      }

      try {
        const port = await getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/operations/${id}`)
        const json = await response.json() as ApiResponse<Operation>
        if (!response.ok || !json.success) {
          throw new Error(json.success ? '获取 Operation 详情失败' : json.error)
        }
        setOperation(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取 Operation 详情失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Operation 中...</div>
  }

  if (error || !operation) {
    return <div className="p-6 text-sm text-[hsl(var(--destructive))]">{error || 'Operation 不存在'}</div>
  }

  const relatedDeploymentJobs = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.deploymentJobId).filter(Boolean) as string[])))
  const relatedChangeRequests = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.changeRequestId).filter(Boolean) as string[])))
  const relatedAlerts = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.alertId).filter(Boolean) as string[])))

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={operation.title || operation.type}
        description={`${operation.type} · ${operation.status}`}
        actions={
          <Link to="/operations" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
            返回 Operations
          </Link>
        }
      />

      <SectionCard title="Operation 概览" description="查看当前操作实例的核心元信息。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.targetId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Trace ID</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.traceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><span className={`inline-flex px-2 py-0.5 text-xs rounded-full border ${statusClass(operation.status)}`}>{operation.status}</span></div>
          <div className="md:col-span-2"><div className="text-[hsl(var(--muted-foreground))]">摘要</div><div className="text-[hsl(var(--foreground))]">{operation.summary || '暂无摘要'}</div></div>
        </div>
      </SectionCard>

      <SectionCard title="关联对象概览" description="快速查看本次 Operation 牵涉到的 Job、变更单和 Alerts。">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Deployment Jobs</div>
            <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{relatedDeploymentJobs.length}</div>
            <div className="mt-3 space-y-2">
              {relatedDeploymentJobs.length > 0 ? relatedDeploymentJobs.map(jobId => (
                <Link key={jobId} to={`/deployment-jobs/${jobId}`} className="block text-sm text-[hsl(var(--google-blue))] hover:underline">
                  {jobId}
                </Link>
              )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">无关联 Deployment Job</div>}
            </div>
          </div>

          <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Change Requests</div>
            <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{relatedChangeRequests.length}</div>
            <div className="mt-3 space-y-2">
              {relatedChangeRequests.length > 0 ? relatedChangeRequests.map(changeId => (
                <Link key={changeId} to={`/changes/${changeId}`} className="block text-sm text-[hsl(var(--google-blue))] hover:underline">
                  {changeId}
                </Link>
              )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">无关联变更单</div>}
            </div>
          </div>

          <div className="rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Alerts</div>
            <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{relatedAlerts.length}</div>
            <div className="mt-3 space-y-2">
              {relatedAlerts.length > 0 ? relatedAlerts.map(alertId => (
                <Link key={alertId} to={`/alerts/${alertId}`} className="block text-sm text-[hsl(var(--google-blue))] hover:underline">
                  {alertId}
                </Link>
              )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">无关联 Alert</div>}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="执行时间线" description="按发生顺序排列的步骤执行流。">
        <div className="relative pl-4 space-y-6 before:absolute before:inset-y-2 before:left-[11px] before:w-px before:bg-[hsl(var(--border))]">
          {operation.phases.flatMap(phase => 
            phase.steps.map(step => ({ ...step, phaseName: phase.name, phaseOrder: phase.orderNo }))
          ).sort((a, b) => {
            const timeA = new Date(a.startedAt || a.endedAt || 0).getTime()
            const timeB = new Date(b.startedAt || b.endedAt || 0).getTime()
            return timeA - timeB
          }).map((step, idx) => (
            <div key={`${step.id}-${idx}`} className="relative pl-6">
              <span className={`absolute left-[-5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-[hsl(var(--background))] ${statusBgClass(step.status)}`} />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                    <span className="text-[hsl(var(--muted-foreground))] text-xs mr-2">P{step.phaseOrder}</span>
                    {step.name}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{step.stepType}</span>
                    {step.deploymentJobId && (
                      <>· <Link to={`/deployment-jobs/${step.deploymentJobId}`} className="text-[hsl(var(--google-blue))] hover:underline">Job: {step.deploymentJobId.slice(0, 8)}</Link></>
                    )}
                    {step.changeRequestId && (
                      <>· <Link to={`/changes/${step.changeRequestId}`} className="text-[hsl(var(--google-blue))] hover:underline">CR: {step.changeRequestId.slice(0, 8)}</Link></>
                    )}
                    {step.alertId && (
                      <>· <Link to={`/alerts/${step.alertId}`} className="text-[hsl(var(--google-blue))] hover:underline">Alert: {step.alertId.slice(0, 8)}</Link></>
                    )}
                  </div>
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] text-right">
                  <div>{formatTimeCompact(step.startedAt)}</div>
                  {step.endedAt && step.endedAt !== step.startedAt && (
                    <div className="text-[hsl(var(--muted-foreground))/60]">{formatTimeCompact(step.endedAt)}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {operation.phases.length === 0 && (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无执行步骤。</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="阶段与步骤" description="按 Phase / Step 展示该 Operation 的执行结构与结果。">
        <div className="space-y-4">
          {operation.phases.map(phase => (
            <div key={phase.id} className="border border-[hsl(var(--border))] rounded-workshop-md overflow-hidden">
              <div className="px-4 py-3 bg-[hsl(var(--muted))] flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[hsl(var(--foreground))]">Phase {phase.orderNo}: {phase.name}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{phase.startedAt ? `开始：${new Date(phase.startedAt).toLocaleString('zh-CN')}` : '未开始'}{phase.endedAt ? ` · 结束：${new Date(phase.endedAt).toLocaleString('zh-CN')}` : ''}</div>
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
                          {step.deploymentJobId && (
                            <Link to={`/deployment-jobs/${step.deploymentJobId}`} className="text-[hsl(var(--google-blue))] hover:underline" onClick={(event) => event.stopPropagation()}>
                              DeploymentJob: {step.deploymentJobId}
                            </Link>
                          )}
                          {step.changeRequestId && (
                            <Link to={`/changes/${step.changeRequestId}`} className="text-[hsl(var(--google-blue))] hover:underline" onClick={(event) => event.stopPropagation()}>
                              ChangeRequest: {step.changeRequestId}
                            </Link>
                          )}
                          {step.alertId && (
                            <Link to={`/alerts/${step.alertId}`} className="text-[hsl(var(--google-blue))] hover:underline" onClick={(event) => event.stopPropagation()}>
                              Alert: {step.alertId}
                            </Link>
                          )}
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
      </SectionCard>
    </div>
  )
}
