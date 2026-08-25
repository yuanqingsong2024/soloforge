import { formatDateTime } from '../lib/i18n-formatters'
import { Link, useParams } from 'react-router-dom'
import { ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState, ErrorState, Button } from '../components/ui'
import { useApiQuery } from '../hooks/useApiQuery'
import type { ReactNode } from 'react'

interface AgentLogRow {
  id: string
  level: string
  message: string
  dataJson: string
  createdAt: string
}

interface AgentActionRow {
  id: string
  actionType: string
  status: string
  traceId: string
  requestJson: string
  resultJson?: string | null
  errorSummary?: string | null
  createdAt: string
}

interface AgentHeartbeatRow {
  id: string
  heartbeatJson: string
  createdAt: string
}

interface HostAgentDetail {
  id: string
  workspaceId: string
  targetId?: string | null
  name: string
  hostname: string
  osType: string
  arch: string
  agentVersion: string
  status: string
  lastHeartbeatAt?: string | null
  capabilitiesJson: string
  labelsJson: string
  target?: { id: string; name: string; envType: string; targetType: string } | null
  actions: AgentActionRow[]
  logs: AgentLogRow[]
  heartbeats: AgentHeartbeatRow[]
}

function prettyJson(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function HostAgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  
  const { data: detail, loading, error, refetch } = useApiQuery<ApiResponse<HostAgentDetail>>(
    id ? `/api/host-agents/${id}` : '/api/invalid',
    { enabled: !!id }
  )

  const agentData = detail?.success ? detail.data : null

  if (loading) {
    return <LoadingState message="加载 Agent 详情中..." />
  }

  if (error || !agentData) {
    return <ErrorState message={error || '加载失败'} onRetry={refetch} />
  }

  const renderDetailList = (
    title: string,
    description: string,
    items: Array<{
      id: string
      content: ReactNode
      body: ReactNode
    }>
  ) => (
    <SectionCard title={title} description={description}>
      <div className="space-y-3">
        {items.map(item => (
          <details key={item.id} className="border border-[hsl(var(--border))] rounded-md p-3">
            <summary className="cursor-pointer">{item.content}</summary>
            <div className="mt-3">{item.body}</div>
          </details>
        ))}
      </div>
    </SectionCard>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={agentData.name}
        description={`Host Agent 详情 · ${agentData.hostname} · ${agentData.status}`}
        actions={<Link to="/agent-actions"><Button variant="secondary" size="sm">查看全部 Actions</Button></Link>}
      />

      <SectionCard title="基础信息" description="Agent、Workspace、Target 与安全边界说明。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono">{agentData.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div>{agentData.target?.name || '未绑定'} {agentData.target ? `· ${agentData.target.envType} · ${agentData.target.targetType}` : ''}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">系统</div><div>{agentData.osType} / {agentData.arch}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">版本</div><div>{agentData.agentVersion}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">最近心跳</div><div>{agentData.lastHeartbeatAt ? formatDateTime(agentData.lastHeartbeatAt) : '从未'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">允许的安全动作说明</div><div>默认仅白名单动作；任意 shell 未开放；高危动作仍受审批、解锁和 policy 约束。</div></div>
        </div>
      </SectionCard>

      <SectionCard title="能力列表" description="capabilities_json 原始声明。">
        <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(agentData.capabilitiesJson)}</pre>
      </SectionCard>

      {renderDetailList(
        `最近动作 (${agentData.actions.length})`,
        '最近派发/执行过的 Agent Actions。',
        agentData.actions.map(action => ({
          id: action.id,
          content: (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{action.actionType}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateTime(action.createdAt)} · {action.traceId}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">{action.status}</span>
                <Link
                  to={`/agent-actions/${action.id}`}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                  onClick={(event) => event.stopPropagation()}
                >
                  查看详情
                </Link>
              </div>
            </div>
          ),
          body: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(action.requestJson)}</pre>
              <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(action.resultJson || action.errorSummary || null)}</pre>
            </div>
          )
        }))
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {renderDetailList(
          `最近心跳 (${agentData.heartbeats.length})`,
          '最新 heartbeat 样本。',
          agentData.heartbeats.map(heartbeat => ({
            id: heartbeat.id,
            content: <div className="text-sm">{formatDateTime(heartbeat.createdAt)}</div>,
            body: <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(heartbeat.heartbeatJson)}</pre>
          }))
        )}

        {renderDetailList(
          `最近日志 (${agentData.logs.length})`,
          'Agent 结构化日志回传。',
          agentData.logs.map(log => ({
            id: log.id,
            content: <summary className="cursor-pointer text-sm">[{log.level}] {log.message}</summary>,
            body: (
              <>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{formatDateTime(log.createdAt)}</div>
                <pre className="mt-3 text-xs font-mono whitespace-pre-wrap p-3 rounded-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(log.dataJson)}</pre>
              </>
            )
          }))
        )}
      </div>
    </div>
  )
}
