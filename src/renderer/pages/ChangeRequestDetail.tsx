import { useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, ErrorState, Button } from '../components/ui'
import { useApiQuery } from '../hooks/useApiQuery'

interface WorkspaceSummary {
  id: string
  name: string
  envType: string
}

interface ChangeRequestDetailData {
  id: string
  workspaceId: string
  type: string
  title: string
  description: string
  diffJson: string
  status: string
  approvalId?: string | null
  jobId?: string | null
  traceId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  workspace: WorkspaceSummary
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function ChangeRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [actionLoading, setActionLoading] = useState<'execute' | 'rollback' | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const { data, loading, error, refetch } = useApiQuery<ApiResponse<ChangeRequestDetailData>>(
    id ? `/api/change-requests/${encodeURIComponent(id)}` : '/api/invalid',
    { enabled: !!id }
  )

  const detail = data?.success ? data.data : null

  const handleAction = async (action: 'execute' | 'rollback') => {
    if (!id) return

    setActionLoading(action)
    setActionMessage(null)

    try {
      const result = await apiFetch<ApiResponse<unknown> | { status?: string; approvalId?: string; message?: string }>(
        `/api/change-requests/${encodeURIComponent(id)}/${action}`,
        { method: 'POST' }
      )

      if ('success' in result) {
        if (!result.success) {
          throw new Error(result.error)
        }
        setActionMessage(`变更单${action === 'execute' ? '执行' : '回滚'}成功`) 
      } else if (result.status === 'pending_approval') {
        setActionMessage(`已提交审批：${result.approvalId || '未知审批 ID'}。请前往审批中心继续。`)
      } else {
        setActionMessage(result.message || `变更单${action === 'execute' ? '执行' : '回滚'}请求已提交`)
      }

      await refetch()
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <LoadingState message="加载变更单详情中..." />
  }

  if (!detail || error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="变更单详情"
          description="加载失败"
          actions={<Button variant="secondary" size="sm" onClick={() => navigate('/changes')}>返回列表</Button>}
        />
        <ErrorState message={error || '变更单不存在'} onRetry={refetch} />
      </div>
    )
  }

  const canExecute = ['DRAFT', 'APPROVED', 'FAILED', 'PENDING_APPROVAL'].includes(detail.status)
  const canRollback = ['APPLIED', 'FAILED'].includes(detail.status)

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.title}
        description={`变更单详情 · ${detail.type} · ${detail.status}`}
        actions={(
          <>
            <Link to="/changes">
              <Button variant="secondary" size="sm">返回列表</Button>
            </Link>
            <button
              type="button"
              disabled={!canExecute || actionLoading !== null}
              onClick={() => handleAction('execute')}
              className="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              {actionLoading === 'execute' ? '执行中...' : '执行变更'}
            </button>
            <button
              type="button"
              disabled={!canRollback || actionLoading !== null}
              onClick={() => handleAction('rollback')}
              className="rounded-full border border-[hsl(var(--google-red)_/_0.18)] bg-[hsl(var(--google-red)_/_0.12)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--google-red)_/_0.18)] disabled:opacity-50"
            >
              {actionLoading === 'rollback' ? '回滚中...' : '回滚变更'}
            </button>
          </>
        )}
      />

      {actionMessage && (
        <div className="px-4 py-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))]">
          {actionMessage}
        </div>
      )}

      <SectionCard title="基础信息" description="变更单的类型、状态、审批与追踪信息。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">变更单 ID</div><div className="font-mono break-all">{detail.id}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div>{detail.workspace.name} · {detail.workspace.envType}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><div>{detail.status}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">类型</div><div>{detail.type}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">审批 ID</div><div className="font-mono break-all">{detail.approvalId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Job ID</div><div className="font-mono break-all">{detail.jobId || '—'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Trace ID</div><div className="font-mono break-all">{detail.traceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">创建者</div><div>{detail.createdBy}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">创建时间</div><div>{formatDateTime(detail.createdAt)}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">更新时间</div><div>{formatDateTime(detail.updatedAt)}</div></div>
        </div>
      </SectionCard>

      <SectionCard title="变更说明" description="用于人工审阅的业务描述。">
        <div className="text-sm whitespace-pre-wrap text-[hsl(var(--foreground))]">{detail.description}</div>
      </SectionCard>

      <SectionCard title="Diff 内容" description="原始 diffJson，便于排查与人工核验。">
        <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-md bg-[hsl(var(--muted))] overflow-auto">
          {prettyJson(detail.diffJson)}
        </pre>
      </SectionCard>
    </div>
  )
}
