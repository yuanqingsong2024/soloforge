import { Link, useParams } from 'react-router-dom'
import { ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, ErrorState, Button } from '../components/ui'
import { useApiQuery } from '../hooks/useApiQuery'

interface AgentActionLog {
  id: string
  level: string
  message: string
  dataJson: string
  createdAt: string
}

interface AgentAction {
  id: string
  workspaceId: string
  targetId: string
  hostAgentId: string
  actionType: string
  status: string
  traceId: string
  requestJson: string
  resultJson?: string | null
  errorSummary?: string | null
  createdAt: string
  hostAgent: { id: string; name: string }
  target: { id: string; name: string }
  logs: AgentActionLog[]
}

function prettyJson(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function AgentActionDetail() {
  const { id } = useParams<{ id: string }>()

  const { data, loading, error, refetch } = useApiQuery<ApiResponse<AgentAction>>(
    id ? `/api/agent-actions/${id}` : '/api/invalid',
    { enabled: !!id }
  )

  const action = data?.success ? data.data : null

  if (loading) {
    return <LoadingState message="加载 Agent Action 中..." />
  }

  if (error || !action) {
    return <ErrorState message={error || 'Agent Action 不存在'} onRetry={refetch} />
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={action.actionType}
        description={`${action.hostAgent.name} · ${action.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/agent-actions">
              <Button variant="secondary" size="sm">返回 Agent Actions</Button>
            </Link>
            <Link to={`/host-agents/${action.hostAgent.id}`}>
              <Button size="sm">查看 Host Agent</Button>
            </Link>
          </div>
        }
      />

      <SectionCard title="动作概览" description="查看动作状态、目标和追踪信息。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono">{action.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div>{action.target.name}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Trace ID</div><div className="font-mono">{action.traceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><div>{action.status}</div></div>
          <div className="md:col-span-2"><div className="text-[hsl(var(--muted-foreground))]">错误摘要</div><div>{action.errorSummary || '—'}</div></div>
        </div>
      </SectionCard>

      <SectionCard title="请求 / 结果 / 日志" description="用于排查动作执行链路的完整上下文。">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <pre className="text-xs font-mono p-4 rounded-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(action.requestJson)}</pre>
          <pre className="text-xs font-mono p-4 rounded-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(action.resultJson || action.errorSummary || null)}</pre>
        </div>
        <div className="space-y-2 mt-4">
          {action.logs.map(log => (
            <details key={log.id} className="border border-[hsl(var(--border))] rounded-md p-3">
              <summary className="cursor-pointer text-sm">[{log.level}] {log.message}</summary>
              <pre className="mt-3 text-xs font-mono p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(log.dataJson)}</pre>
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
