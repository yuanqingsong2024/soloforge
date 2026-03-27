import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

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

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

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
  const [action, setAction] = useState<AgentAction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('缺少 Agent Action ID')
        setLoading(false)
        return
      }

      try {
        const port = await getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/agent-actions/${id}`)
        const json = await response.json() as ApiResponse<AgentAction>
        if (!response.ok || !json.success) {
          throw new Error(json.success ? '获取 Agent Action 详情失败' : json.error)
        }
        setAction(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取 Agent Action 详情失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  if (loading) {
    return <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">加载 Agent Action 中...</div>
  }

  if (error || !action) {
    return <div className="p-6 text-sm text-[hsl(var(--destructive))]">{error || 'Agent Action 不存在'}</div>
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={action.actionType}
        description={`${action.hostAgent.name} · ${action.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/agent-actions" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
              返回 Agent Actions
            </Link>
            <Link to={`/host-agents/${action.hostAgent.id}`} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              查看 Host Agent
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
          <pre className="text-xs font-mono p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(action.requestJson)}</pre>
          <pre className="text-xs font-mono p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(action.resultJson || action.errorSummary || null)}</pre>
        </div>
        <div className="space-y-2 mt-4">
          {action.logs.map(log => (
            <details key={log.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
              <summary className="cursor-pointer text-sm">[{log.level}] {log.message}</summary>
              <pre className="mt-3 text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(log.dataJson)}</pre>
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
