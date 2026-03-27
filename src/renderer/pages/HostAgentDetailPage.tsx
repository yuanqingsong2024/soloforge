import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

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

interface ApiOk<T> { success: true; data: T }
interface ApiFail { success: false; error: string }
type ApiResponse<T> = ApiOk<T> | ApiFail

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
  const [detail, setDetail] = useState<HostAgentDetail | null>(null)

  useEffect(() => {
    if (!id) return
    getApiPort().then(async port => {
      const response = await fetch(`http://127.0.0.1:${port}/api/host-agents/${id}`)
      const json = await response.json() as ApiResponse<HostAgentDetail>
      if (json.success) setDetail(json.data)
    })
  }, [id])

  if (!detail) {
    return <div className="text-sm text-[hsl(var(--muted-foreground))]">加载 Agent 详情中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.name}
        description={`Host Agent 详情 · ${detail.hostname} · ${detail.status}`}
        actions={<Link to="/agent-actions" className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))]">查看全部 Actions</Link>}
      />

      <SectionCard title="基础信息" description="Agent、Workspace、Target 与安全边界说明。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono">{detail.workspaceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div>{detail.target?.name || '未绑定'} {detail.target ? `· ${detail.target.envType} · ${detail.target.targetType}` : ''}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">系统</div><div>{detail.osType} / {detail.arch}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">版本</div><div>{detail.agentVersion}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">最近心跳</div><div>{detail.lastHeartbeatAt ? new Date(detail.lastHeartbeatAt).toLocaleString('zh-CN') : '从未'}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">允许的安全动作说明</div><div>默认仅白名单动作；任意 shell 未开放；高危动作仍受审批、解锁和 policy 约束。</div></div>
        </div>
      </SectionCard>

      <SectionCard title="能力列表" description="capabilities_json 原始声明。">
        <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(detail.capabilitiesJson)}</pre>
      </SectionCard>

      <SectionCard title={`最近动作 (${detail.actions.length})`} description="最近派发/执行过的 Agent Actions。">
        <div className="space-y-3">
          {detail.actions.map(action => (
            <details key={action.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
              <summary className="cursor-pointer flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{action.actionType}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(action.createdAt).toLocaleString('zh-CN')} · {action.traceId}</div>
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
              </summary>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(action.requestJson)}</pre>
                <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(action.resultJson || action.errorSummary || null)}</pre>
              </div>
            </details>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title={`最近心跳 (${detail.heartbeats.length})`} description="最新 heartbeat 样本。">
          <div className="space-y-3">
            {detail.heartbeats.map(heartbeat => (
              <details key={heartbeat.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                <summary className="cursor-pointer text-sm">{new Date(heartbeat.createdAt).toLocaleString('zh-CN')}</summary>
                <pre className="mt-3 text-xs font-mono whitespace-pre-wrap p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(heartbeat.heartbeatJson)}</pre>
              </details>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={`最近日志 (${detail.logs.length})`} description="Agent 结构化日志回传。">
          <div className="space-y-3">
            {detail.logs.map(log => (
              <details key={log.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                <summary className="cursor-pointer text-sm">[{log.level}] {log.message}</summary>
                <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{new Date(log.createdAt).toLocaleString('zh-CN')}</div>
                <pre className="mt-3 text-xs font-mono whitespace-pre-wrap p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto">{prettyJson(log.dataJson)}</pre>
              </details>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
