import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'

interface HostAgentRow {
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
  target?: {
    id: string
    name: string
    envType: string
  } | null
}

interface DashboardStats {
  onlineAgents: number
  degradedAgents: number
  offlineAgents: number
  failedActions: number
  heartbeatHealth: number
  recentlyRegisteredAgents: HostAgentRow[]
}

interface ApiOk<T> {
  success: true
  data: T
}

interface ApiFail {
  success: false
  error: string
}

type ApiResponse<T> = ApiOk<T> | ApiFail

function parseCapabilities(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.entries(parsed)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
  } catch {
    return []
  }
}

export function HostAgentsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const initialQuery = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      workspaceId: params.get('workspaceId') || localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
      status: params.get('status') || ''
    }
  }, [location.search])
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [workspaceId, setWorkspaceId] = useState(initialQuery.workspaceId)
  const [status, setStatus] = useState(initialQuery.status)
  const [rows, setRows] = useState<HostAgentRow[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    setWorkspaceId(initialQuery.workspaceId)
    setStatus(initialQuery.status)
  }, [initialQuery])

  useEffect(() => {
    getApiPort().then(port => {
      setApiPort(port)
      void load(port, workspaceId, status)
    })
  }, [workspaceId, status])

  const { lastEventPollAt } = useEventDrivenRefresh({
    apiPort,
    workspaceId,
    targetId: undefined,
    enabled: Boolean(autoRefresh && apiPort && workspaceId),
    hasActiveWork: Boolean((stats?.onlineAgents || 0) + (stats?.degradedAgents || 0) > 0),
    onRelevantEvent: async () => {
      if (!apiPort) return
      await load(apiPort, workspaceId, status)
    }
  })

  const load = async (port: number, wid: string, nextStatus: string) => {
    setLoading(true)
    const params = new URLSearchParams({ workspaceId: wid })
    if (nextStatus) params.set('status', nextStatus)

    const [rowsRes, statsRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/host-agents?${params.toString()}`),
      fetch(`http://127.0.0.1:${port}/api/host-agents/dashboard?workspaceId=${encodeURIComponent(wid)}`)
    ])

    const rowsJson = await rowsRes.json() as ApiResponse<HostAgentRow[]>
    const statsJson = await statsRes.json() as ApiResponse<DashboardStats>
    if (rowsJson.success) setRows(rowsJson.data)
    if (statsJson.success) setStats(statsJson.data)
    setLoading(false)
  }

  const runTestAction = async (id: string) => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/host-agents/${id}/test-action`, { method: 'POST' })
    await load(apiPort, workspaceId, status)
  }

  const revokeAgent = async (id: string) => {
    if (!apiPort) return
    await fetch(`http://127.0.0.1:${apiPort}/api/host-agents/${id}/revoke`, { method: 'POST' })
    await load(apiPort, workspaceId, status)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Host Agents"
        description="远程宿主机代理中心：注册、心跳、动作派发、回执与 SSH fallback 状态总览"
        actions={
          <button
            onClick={() => navigate('/host-agents/new')}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-workshop-md hover:opacity-90"
          >
            Create Bootstrap Token
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <SectionCard className="!p-4"><div className="text-sm text-[hsl(var(--muted-foreground))]">在线 Agents</div><div className="text-2xl font-bold">{stats?.onlineAgents ?? 0}</div></SectionCard>
        <SectionCard className="!p-4"><div className="text-sm text-[hsl(var(--muted-foreground))]">降级 Agents</div><div className="text-2xl font-bold">{stats?.degradedAgents ?? 0}</div></SectionCard>
        <SectionCard className="!p-4"><div className="text-sm text-[hsl(var(--muted-foreground))]">离线 Agents</div><div className="text-2xl font-bold">{stats?.offlineAgents ?? 0}</div></SectionCard>
        <SectionCard className="!p-4"><div className="text-sm text-[hsl(var(--muted-foreground))]">失败动作</div><div className="text-2xl font-bold">{stats?.failedActions ?? 0}</div></SectionCard>
        <SectionCard className="!p-4"><div className="text-sm text-[hsl(var(--muted-foreground))]">Heartbeat Health</div><div className="text-2xl font-bold">{stats?.heartbeatHealth ?? 100}%</div></SectionCard>
      </div>

      <SectionCard title="筛选器" description="按 workspace 与状态筛选 Host Agent 列表。">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Workspace ID" />
          <select value={status} onChange={event => setStatus(event.target.value)} className="px-3 py-2 text-sm rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            <option value="">全部状态</option>
            <option value="ONLINE">ONLINE</option>
            <option value="DEGRADED">DEGRADED</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="UNREGISTERED">UNREGISTERED</option>
          </select>
          <button onClick={() => apiPort && void load(apiPort, workspaceId, status)} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">刷新</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <div>
            {lastEventPollAt ? `最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : '尚未进行事件检查'}
          </div>
          <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-1.5">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={event => setAutoRefresh(event.target.checked)}
              className="rounded border-[hsl(var(--border))]"
            />
            <span>事件驱动自动刷新</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title={`Agent 列表 (${rows.length})`} description="远程 Agent 与 target 绑定关系、能力声明和最近心跳。">
        {loading ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))]">当前 workspace 暂无 Host Agent。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[hsl(var(--muted))]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs">Agent</th>
                  <th className="px-4 py-3 text-left text-xs">Target</th>
                  <th className="px-4 py-3 text-left text-xs">状态</th>
                  <th className="px-4 py-3 text-left text-xs">版本</th>
                  <th className="px-4 py-3 text-left text-xs">能力</th>
                  <th className="px-4 py-3 text-left text-xs">最后心跳</th>
                  <th className="px-4 py-3 text-right text-xs">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-[hsl(var(--accent))]">
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/host-agents/${row.id}`} className="font-semibold text-[hsl(var(--primary))]">{row.name}</Link>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{row.hostname} · {row.osType}/{row.arch}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.target?.name || '未绑定'}</td>
                    <td className="px-4 py-3 text-sm">{row.status}</td>
                    <td className="px-4 py-3 text-sm">{row.agentVersion}</td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{parseCapabilities(row.capabilitiesJson).slice(0, 4).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-sm">{row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt).toLocaleString('zh-CN') : '从未'}</td>
                    <td className="px-4 py-3 text-right text-sm space-x-3">
                      <button onClick={() => void runTestAction(row.id)} className="text-[hsl(var(--primary))] hover:opacity-80">Run Test Action</button>
                      <button onClick={() => void revokeAgent(row.id)} className="text-[hsl(var(--destructive))] hover:opacity-80">Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recently Registered Agents" description="最近注册成功的 Agent。">
        <div className="space-y-2">
          {(stats?.recentlyRegisteredAgents || []).map(item => (
            <div key={item.id} className="p-3 rounded-workshop-md border border-[hsl(var(--border))] flex items-center justify-between">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{item.hostname} · {item.target?.name || '未绑定 target'}</div>
              </div>
              <div className="text-sm">{item.status}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
