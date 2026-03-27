import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'

interface AgentActionRow {
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
  logs: Array<{ id: string; level: string; message: string; dataJson: string; createdAt: string }>
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

export function AgentActionsPage() {
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [rows, setRows] = useState<AgentActionRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [filters, setFilters] = useState({
    workspaceId: localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001',
    targetId: '',
    hostAgentId: '',
    actionType: '',
    status: ''
  })

  useEffect(() => {
    getApiPort().then(async port => {
      setApiPort(port)
      await load(port)
    })
  }, [])

  const load = async (port: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value)
    }
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-actions?${params.toString()}`)
    const json = await response.json() as ApiResponse<AgentActionRow[]>
    if (json.success) {
      setRows(json.data)
      if (!selectedId && json.data.length > 0) setSelectedId(json.data[0].id)
    }
  }

  const selected = useMemo(() => rows.find(item => item.id === selectedId) || null, [rows, selectedId])

  return (
    <div className="space-y-6">
      <PageHeader title="Agent Actions" description="查看结构化 request / result / logs，按 workspace、target、agent、动作类型和状态过滤。" />

      <SectionCard title="过滤器" description="只看当前关心的 Agent 动作。">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input value={filters.workspaceId} onChange={event => setFilters(prev => ({ ...prev, workspaceId: event.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Workspace ID" />
          <input value={filters.targetId} onChange={event => setFilters(prev => ({ ...prev, targetId: event.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Target ID" />
          <input value={filters.hostAgentId} onChange={event => setFilters(prev => ({ ...prev, hostAgentId: event.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Agent ID" />
          <input value={filters.actionType} onChange={event => setFilters(prev => ({ ...prev, actionType: event.target.value }))} className="px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Action Type" />
          <div className="flex gap-2">
            <input value={filters.status} onChange={event => setFilters(prev => ({ ...prev, status: event.target.value }))} className="flex-1 px-3 py-2 rounded-workshop-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]" placeholder="Status" />
            <button onClick={() => apiPort && void load(apiPort)} className="px-4 py-2 rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">刷新</button>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)] gap-6">
        <SectionCard title={`动作列表 (${rows.length})`} description="左侧快速定位失败 / 阻塞 / 超时动作。">
          <div className="space-y-3">
            {rows.map(row => (
              <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left p-4 rounded-workshop-md border ${selectedId === row.id ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--border))]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.actionType}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{row.hostAgent.name} · {row.target.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{new Date(row.createdAt).toLocaleString('zh-CN')}</div>
                  </div>
                  <span className="text-sm">{row.status}</span>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    to={`/agent-actions/${row.id}`}
                    className="rounded-full px-3 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    查看详情
                  </Link>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={selected ? selected.actionType : '动作详情'} description={selected ? `${selected.hostAgent.name} · ${selected.traceId}` : '请选择左侧动作'}>
          {!selected ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无选中动作。</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><div className="text-[hsl(var(--muted-foreground))]">Workspace</div><div className="font-mono">{selected.workspaceId}</div></div>
                <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><div>{selected.status}</div></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <pre className="text-xs font-mono p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(selected.requestJson)}</pre>
                <pre className="text-xs font-mono p-4 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(selected.resultJson || selected.errorSummary || null)}</pre>
              </div>
              <div className="space-y-2">
                {selected.logs.map(log => (
                  <details key={log.id} className="border border-[hsl(var(--border))] rounded-workshop-md p-3">
                    <summary className="cursor-pointer text-sm">[{log.level}] {log.message}</summary>
                    <pre className="mt-3 text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto whitespace-pre-wrap">{prettyJson(log.dataJson)}</pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
