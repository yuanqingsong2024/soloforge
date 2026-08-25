import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../lib/i18n-formatters'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch, ApiResponse } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { useEventDrivenRefresh } from '../hooks/useEventDrivenRefresh'
import { ThemeCheckbox, ThemeInput, ThemeSelect } from '../components/ui/FormFields'
import { readWorkspaceId } from '../lib/storage'

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
      workspaceId: params.get('workspaceId') || readWorkspaceId(),
      targetId: params.get('targetId') || '',
      status: params.get('status') || ''
    }
  }, [location.search])
  const [workspaceId, setWorkspaceId] = useState(initialQuery.workspaceId)
  const [targetId, setTargetId] = useState(initialQuery.targetId)
  const [status, setStatus] = useState(initialQuery.status)
  const [rows, setRows] = useState<HostAgentRow[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  useEffect(() => {
    setWorkspaceId(initialQuery.workspaceId)
    setTargetId(initialQuery.targetId)
    setStatus(initialQuery.status)
  }, [initialQuery])

  useEffect(() => {
    void load(workspaceId, targetId, status)
  }, [targetId, workspaceId, status])

  const { lastEventPollAt } = useEventDrivenRefresh({
    workspaceId,
    targetId: undefined,
    enabled: Boolean(autoRefresh && workspaceId),
    hasActiveWork: Boolean((stats?.onlineAgents || 0) + (stats?.degradedAgents || 0) > 0),
    onRelevantEvent: async () => {
      await load(workspaceId, targetId, status)
    }
  })

  const load = async (wid: string, nextTargetId: string, nextStatus: string) => {
    setLoading(true)
    const params = new URLSearchParams({ workspaceId: wid })
    if (nextTargetId) params.set('targetId', nextTargetId)
    if (nextStatus) params.set('status', nextStatus)

    const [rowsJson, statsJson] = await Promise.all([
      apiFetch<ApiResponse<HostAgentRow[]>>(`/api/host-agents?${params.toString()}`),
      apiFetch<ApiResponse<DashboardStats>>(`/api/host-agents/dashboard?workspaceId=${encodeURIComponent(wid)}`)
    ])

    if (rowsJson.success) setRows(rowsJson.data ?? [])
    if (statsJson.success) setStats(statsJson.data ?? null)
    setLoading(false)
  }

  const runTestAction = async (id: string) => {
    await apiFetch(`/api/host-agents/${id}/test-action`, { method: 'POST' })
    await load(workspaceId, targetId, status)
  }

  const revokeAgent = async (id: string) => {
    await apiFetch(`/api/host-agents/${id}/revoke`, { method: 'POST' })
    await load(workspaceId, targetId, status)
  }

  const renderRecentlyRegisteredAgents = () => (
    <SectionCard title="最近注册的代理" description="最近注册成功并开始上报心跳的主机代理。">
      <div className="space-y-2">
        {(stats?.recentlyRegisteredAgents || []).map(item => renderRecentAgentItem(item))}
      </div>
    </SectionCard>
  )

  const overviewCards = [
    { label: '在线代理', value: stats?.onlineAgents ?? 0 },
    { label: '降级代理', value: stats?.degradedAgents ?? 0 },
    { label: '离线代理', value: stats?.offlineAgents ?? 0 },
    { label: '失败动作', value: stats?.failedActions ?? 0 },
    { label: '心跳健康度', value: `${stats?.heartbeatHealth ?? 100}%` }
  ]

  const renderAgentRow = (row: HostAgentRow) => (
    <tr key={row.id} className="hover:bg-[hsl(var(--accent))]">
      <td className="px-4 py-3 text-sm">
        <Link to={`/host-agents/${row.id}`} className="font-semibold text-[hsl(var(--primary))]">{row.name}</Link>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">{row.hostname} · {row.osType}/{row.arch}</div>
      </td>
      <td className="px-4 py-3 text-sm">{row.target?.name || '未绑定'}</td>
      <td className="px-4 py-3 text-sm">{row.status}</td>
      <td className="px-4 py-3 text-sm">{row.agentVersion}</td>
      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{parseCapabilities(row.capabilitiesJson).slice(0, 4).join(', ') || '—'}</td>
      <td className="px-4 py-3 text-sm">{row.lastHeartbeatAt ? formatDateTime(row.lastHeartbeatAt) : '从未'}</td>
      <td className="px-4 py-3 text-right text-sm space-x-3">
        <button onClick={() => void runTestAction(row.id)} className="text-[hsl(var(--primary))] hover:opacity-80">执行测试动作</button>
        <button onClick={() => void revokeAgent(row.id)} className="text-[hsl(var(--destructive))] hover:opacity-80">撤销代理</button>
      </td>
    </tr>
  )

  const renderRecentAgentItem = (item: HostAgentRow) => (
    <div key={item.id} className="p-3 rounded-md border border-[hsl(var(--border))] flex items-center justify-between">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">{item.hostname} · {item.target?.name || '未绑定目标环境'}</div>
      </div>
      <div className="text-sm">{item.status}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="主机代理中心"
        description="统一查看远程宿主机代理的注册状态、心跳健康、动作派发与执行情况。"
        actions={
          <button
            onClick={() => navigate('/host-agents/new')}
            className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90"
          >
            创建引导令牌
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {overviewCards.map(card => (
          <SectionCard key={card.label} className="!p-4">
            <div className="text-sm text-[hsl(var(--muted-foreground))]">{card.label}</div>
            <div className="text-2xl font-bold">{card.value}</div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="筛选器" description="按工作区、目标环境与状态收敛主机代理列表。">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ThemeInput value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} placeholder="工作区 ID" fieldSize="lg" />
          <ThemeInput value={targetId} onChange={event => setTargetId(event.target.value)} placeholder="目标环境 ID" fieldSize="lg" />
          <ThemeSelect value={status} onChange={event => setStatus(event.target.value)} fieldSize="lg">
            <option value="">全部状态</option>
            <option value="ONLINE">ONLINE</option>
            <option value="DEGRADED">DEGRADED</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="UNREGISTERED">UNREGISTERED</option>
          </ThemeSelect>
          <button onClick={() => void load(workspaceId, targetId, status)} className="px-4 py-2 text-sm rounded-md bg-[hsl(var(--muted))] hover:opacity-90">应用筛选</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <div>
            {lastEventPollAt ? `最近事件检查：${new Date(lastEventPollAt).toLocaleTimeString('zh-CN')}` : '尚未进行事件检查'}
          </div>
          <label className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.52)] px-3 py-1.5">
            <ThemeCheckbox
              checked={autoRefresh}
              onChange={event => setAutoRefresh(event.target.checked)}
            />
            <span>事件驱动自动刷新</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title={`主机代理列表（${rows.length}）`} description="查看代理与目标环境的绑定关系、能力声明和最近心跳。">
        {loading ? (
          <LoadingState message="加载主机代理中..." />
        ) : rows.length === 0 ? (
          <EmptyState message="当前工作区暂无主机代理。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[hsl(var(--muted))]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs">代理</th>
                  <th className="px-4 py-3 text-left text-xs">目标环境</th>
                  <th className="px-4 py-3 text-left text-xs">状态</th>
                  <th className="px-4 py-3 text-left text-xs">版本</th>
                  <th className="px-4 py-3 text-left text-xs">能力</th>
                  <th className="px-4 py-3 text-left text-xs">最后心跳</th>
                  <th className="px-4 py-3 text-right text-xs">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {rows.map(row => renderAgentRow(row))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {renderRecentlyRegisteredAgents()}
    </div>
  )
}
