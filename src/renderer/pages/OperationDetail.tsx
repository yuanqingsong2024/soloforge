import { formatDateTime } from '../lib/i18n-formatters'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, ErrorState, EmptyState, Button } from '../components/ui'
import { StatusBadge } from '../components/ui/StatusBadge'
import { translateEnum } from '../lib/i18n-helpers'
import { useApiQuery } from '../hooks/useApiQuery'

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

function getStatusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'muted' {
  switch (status) {
    case 'SUCCEEDED':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'RUNNING':
      return 'info'
    case 'WAITING_APPROVAL':
      return 'warning'
    default:
      return 'muted'
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
  const { t } = useTranslation(['common'])
  const { id } = useParams<{ id: string }>()

  const { data, loading, error, refetch } = useApiQuery<ApiResponse<Operation>>(
    id ? `/api/operations/${id}` : '/api/invalid',
    { enabled: !!id }
  )

  const operation = data?.success ? data.data : null

  if (loading) {
    return <div className="p-6"><LoadingState message="加载操作详情中..." /></div>
  }

  if (error || !operation) {
    return <div className="p-6"><ErrorState message={error || '操作任务不存在'} onRetry={refetch} /></div>
  }

  const relatedDeploymentJobs = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.deploymentJobId).filter(Boolean) as string[])))
  const relatedChangeRequests = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.changeRequestId).filter(Boolean) as string[])))
  const relatedAlerts = Array.from(new Set(operation.phases.flatMap(phase => phase.steps.map(step => step.alertId).filter(Boolean) as string[])))

  const renderRelatedBox = (
    title: string,
    count: number,
    emptyText: string,
    items: string[],
    routePrefix: string
  ) => (
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{count}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.map(item => (
          <Link key={item} to={`${routePrefix}/${item}`} className="block text-sm text-[hsl(var(--google-blue))] hover:underline">
            {item}
          </Link>
        )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">{emptyText}</div>}
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={operation.title || operation.type}
        description={`${operation.type} · ${translateEnum(t, 'operationStatusMap', operation.status)}`}
        actions={
          <Link to="/operations">
            <Button variant="secondary" size="sm">返回操作中心</Button>
          </Link>
        }
      />

      <SectionCard title="操作概览" description="查看当前操作任务的核心信息与执行状态。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">工作区</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">目标环境</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.targetId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">链路 ID</div><div className="font-mono text-[hsl(var(--foreground))]">{operation.traceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><StatusBadge label={translateEnum(t, 'operationStatusMap', operation.status)} tone={getStatusTone(operation.status)} /></div>
          <div className="md:col-span-2"><div className="text-[hsl(var(--muted-foreground))]">摘要</div><div className="text-[hsl(var(--foreground))]">{operation.summary || '暂无摘要'}</div></div>
        </div>
      </SectionCard>

      <SectionCard title="关联对象概览" description="快速查看本次操作任务关联的部署作业、变更单和告警。">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderRelatedBox('部署任务', relatedDeploymentJobs.length, '无关联部署任务', relatedDeploymentJobs, '/deployment-jobs')}
          {renderRelatedBox('变更单', relatedChangeRequests.length, '无关联变更单', relatedChangeRequests, '/changes')}
          {renderRelatedBox('告警', relatedAlerts.length, '无关联告警', relatedAlerts, '/alerts')}
        </div>
      </SectionCard>

      <SectionCard title="执行时间线" description="按发生顺序查看本次操作任务的步骤推进过程。">
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
                    <>· <Link to={`/deployment-jobs/${step.deploymentJobId}`} className="text-[hsl(var(--google-blue))] hover:underline">任务: {step.deploymentJobId.slice(0, 8)}</Link></>
                    )}
                    {step.changeRequestId && (
                    <>· <Link to={`/changes/${step.changeRequestId}`} className="text-[hsl(var(--google-blue))] hover:underline">变更单: {step.changeRequestId.slice(0, 8)}</Link></>
                    )}
                    {step.alertId && (
                    <>· <Link to={`/alerts/${step.alertId}`} className="text-[hsl(var(--google-blue))] hover:underline">告警: {step.alertId.slice(0, 8)}</Link></>
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
            <EmptyState message="暂无执行步骤" />
          )}
        </div>
      </SectionCard>

      <SectionCard title="阶段与步骤" description="按阶段与步骤展开执行结构、请求和结果。">
        <div className="space-y-4">
          {operation.phases.map(phase => (
            <div key={phase.id} className="border border-[hsl(var(--border))] rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-[hsl(var(--muted))] flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[hsl(var(--foreground))]">阶段 {phase.orderNo}: {phase.name}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{phase.startedAt ? `开始：${formatDateTime(phase.startedAt)}` : '未开始'}{phase.endedAt ? ` · 结束：${formatDateTime(phase.endedAt)}` : ''}</div>
                </div>
                <StatusBadge label={translateEnum(t, 'operationStatusMap', phase.status)} tone={getStatusTone(phase.status)} />
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
                              部署任务: {step.deploymentJobId}
                            </Link>
                          )}
                          {step.changeRequestId && (
                            <Link to={`/changes/${step.changeRequestId}`} className="text-[hsl(var(--google-blue))] hover:underline" onClick={(event) => event.stopPropagation()}>
                              变更单: {step.changeRequestId}
                            </Link>
                          )}
                          {step.alertId && (
                            <Link to={`/alerts/${step.alertId}`} className="text-[hsl(var(--google-blue))] hover:underline" onClick={(event) => event.stopPropagation()}>
                              告警: {step.alertId}
                            </Link>
                          )}
                        </div>
                      </div>
                       <StatusBadge label={translateEnum(t, 'operationStatusMap', step.status)} tone={getStatusTone(step.status)} />
                    </summary>
                    <div className="px-4 pb-4 space-y-3 bg-[hsl(var(--background))]">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">请求</div>
                          <pre className="text-xs font-mono p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto max-h-56">{parseJsonText(step.requestJson)}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">结果</div>
                          <pre className="text-xs font-mono p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto max-h-56">{parseJsonText(step.resultJson)}</pre>
                        </div>
                      </div>
                      {step.logs && (
                        <div>
                          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">日志</div>
                          <pre className="text-xs font-mono p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto max-h-56 whitespace-pre-wrap">{step.logs}</pre>
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
