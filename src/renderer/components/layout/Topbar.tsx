import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'
import { getApiPort } from '../../lib/api'

interface SearchTicketResult {
  id: string
  title: string
  source: string
  status: string
  priority: string
}

interface SearchApprovalResult {
  id: string
  actionType: string
  status: string
  requestedBy: string
  ticketId: string | null
}

interface SearchAuditResult {
  id: string
  traceId: string
  actor: string
  action: string
  ts: string
}

interface SearchResponse {
  query: string
  tickets: SearchTicketResult[]
  approvals: SearchApprovalResult[]
  auditLogs: SearchAuditResult[]
}

interface HostAgentDashboardStats {
  totalAgents: number
  onlineAgents: number
  degradedAgents: number
  recentHeartbeats: number
  pendingActions: number
}

interface RuntimePreviewState {
  agents: Array<{ id: string; name: string; status: string }>
  operations: Array<{ id: string; title: string; status: string }>
  alerts: Array<{ id: string; title: string; severity: string }>
}

type RuntimePreviewKey = 'agents' | 'operations' | 'alerts' | 'status-center' | null

// 连接状态类型
type ConnectionStatus = 'connected' | 'disconnected'

// Topbar 组件
export function Topbar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [currentProfile, setCurrentProfile] = useState<string>('未连接')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [runtimeSummary, setRuntimeSummary] = useState({
    onlineAgents: 0,
    openAlerts: 0,
    runningOperations: 0
  })
  const [runtimePreview, setRuntimePreview] = useState<RuntimePreviewState>({
    agents: [],
    operations: [],
    alerts: []
  })
  const [activePreview, setActivePreview] = useState<RuntimePreviewKey>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const totalResults = useMemo(() => {
    if (!searchResults) return 0
    return searchResults.tickets.length + searchResults.approvals.length + searchResults.auditLogs.length
  }, [searchResults])

  // 检查连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const port = await getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/connection-profiles`)
        if (response.ok) {
          const profiles = await response.json()
          const activeProfile = Array.isArray(profiles)
            ? profiles.find((profile: unknown) => {
                if (typeof profile !== 'object' || profile === null) {
                  return false
                }
                return Boolean((profile as { isActive?: boolean }).isActive)
              }) as { name?: string } | undefined
            : undefined
          if (activeProfile) {
            setCurrentProfile(activeProfile.name || '已连接')
            setConnectionStatus('connected')
          } else {
            setCurrentProfile('未连接')
            setConnectionStatus('disconnected')
          }
        }
      } catch (error) {
        setConnectionStatus('disconnected')
        setCurrentProfile('未连接')
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 10000) // 每 10 秒检查一次
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadRuntimeSummary = async () => {
      try {
        const port = await getApiPort()
        const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'

        const [hostAgentRes, alertsRes, operationsRes, hostAgentListRes, operationsListRes, alertsListRes] = await Promise.all([
          fetch(`http://127.0.0.1:${port}/api/host-agents/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`),
          fetch(`http://127.0.0.1:${port}/api/alerts?workspaceId=${encodeURIComponent(workspaceId)}&status=OPEN`),
          fetch(`http://127.0.0.1:${port}/api/operations?workspaceId=${encodeURIComponent(workspaceId)}&status=RUNNING`),
          fetch(`http://127.0.0.1:${port}/api/host-agents?workspaceId=${encodeURIComponent(workspaceId)}&status=ONLINE`),
          fetch(`http://127.0.0.1:${port}/api/operations?workspaceId=${encodeURIComponent(workspaceId)}&status=RUNNING`),
          fetch(`http://127.0.0.1:${port}/api/alerts?workspaceId=${encodeURIComponent(workspaceId)}&status=OPEN`)
        ])

        const hostAgentJson = await hostAgentRes.json() as { success?: boolean; data?: HostAgentDashboardStats }
        const alertsJson = await alertsRes.json() as { success?: boolean; data?: Array<unknown> }
        const operationsJson = await operationsRes.json() as { success?: boolean; data?: Array<unknown> }
        const hostAgentListJson = await hostAgentListRes.json() as { success?: boolean; data?: Array<{ id: string; name: string; status: string }> }
        const operationsListJson = await operationsListRes.json() as { success?: boolean; data?: Array<{ id: string; title: string; status: string }> }
        const alertsListJson = await alertsListRes.json() as { success?: boolean; data?: Array<{ id: string; title: string; severity: string }> }

        setRuntimeSummary({
          onlineAgents: hostAgentJson.success && hostAgentJson.data ? hostAgentJson.data.onlineAgents + hostAgentJson.data.degradedAgents : 0,
          openAlerts: alertsJson.success && Array.isArray(alertsJson.data) ? alertsJson.data.length : 0,
          runningOperations: operationsJson.success && Array.isArray(operationsJson.data) ? operationsJson.data.length : 0
        })
        setRuntimePreview({
          agents: hostAgentListJson.success && Array.isArray(hostAgentListJson.data) ? hostAgentListJson.data.slice(0, 3) : [],
          operations: operationsListJson.success && Array.isArray(operationsListJson.data) ? operationsListJson.data.slice(0, 3) : [],
          alerts: alertsListJson.success && Array.isArray(alertsListJson.data) ? alertsListJson.data.slice(0, 3) : []
        })
      } catch (error) {
        setRuntimeSummary({
          onlineAgents: 0,
          openAlerts: 0,
          runningOperations: 0
        })
        setRuntimePreview({ agents: [], operations: [], alerts: [] })
      }
    }

    void loadRuntimeSummary()
    const interval = setInterval(() => {
      void loadRuntimeSummary()
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!previewRef.current) return
      if (!previewRef.current.contains(event.target as Node)) {
        setActivePreview(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePreview(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // 搜索处理
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults(null)
      setSearchError(null)
      return
    }

    setSearching(true)
    setSearchError(null)
    try {
      const port = await getApiPort()
      const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
      const params = new URLSearchParams({ q: query, workspaceId })
      const response = await fetch(`http://127.0.0.1:${port}/api/search?${params.toString()}`)
      const result = await response.json() as { success: boolean; data?: SearchResponse; error?: string }
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '搜索失败')
      }
      setSearchResults(result.data)
    } catch (error) {
      setSearchResults(null)
      setSearchError(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
    setSearchError(null)
  }

  const quickLinks = [
    { to: '/deployments', label: 'Deployments', hint: '部署' },
    { to: '/host-agents', label: 'Host Agents', hint: '宿主机' },
    { to: '/activity-feed', label: 'Activity Feed', hint: '事件流' }
  ]

  const runtimePills = [
    {
      key: 'agents' as const,
      to: '/host-agents?status=ONLINE',
      label: '在线 Agent',
      value: runtimeSummary.onlineAgents,
      description: runtimeSummary.onlineAgents > 0 ? '运行健康' : '等待上线',
      tone: runtimeSummary.onlineAgents > 0
        ? 'border-[hsl(var(--google-green)_/_0.22)] bg-[hsl(var(--google-green)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.onlineAgents > 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'
    },
    {
      key: 'operations' as const,
      to: '/operations?status=RUNNING',
      label: '运行中 Jobs',
      value: runtimeSummary.runningOperations,
      description: runtimeSummary.runningOperations > 0 ? '系统忙碌' : '当前空闲',
      tone: runtimeSummary.runningOperations > 0
        ? 'border-[hsl(var(--google-blue)_/_0.22)] bg-[hsl(var(--google-blue)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.runningOperations > 0 ? 'text-[hsl(var(--google-blue))]' : 'text-[hsl(var(--muted-foreground))]'
    },
    {
      key: 'alerts' as const,
      to: '/alerts?status=OPEN',
      label: '未解决 Alerts',
      value: runtimeSummary.openAlerts,
      description: runtimeSummary.openAlerts > 0 ? '需要关注' : '暂无告警',
      tone: runtimeSummary.openAlerts > 0
        ? 'border-[hsl(var(--google-red)_/_0.22)] bg-[hsl(var(--google-red)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.openAlerts > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'
    }
  ]

  const activePreviewItems = activePreview === 'agents'
    ? runtimePreview.agents.map(item => ({ id: item.id, primary: item.name, secondary: item.status, to: `/host-agents/${item.id}`, action: null as null | 'ack' }))
    : activePreview === 'operations'
      ? runtimePreview.operations.map(item => ({ id: item.id, primary: item.title, secondary: item.status, to: '/operations?status=RUNNING', action: null as null | 'ack' }))
      : activePreview === 'alerts'
        ? runtimePreview.alerts.map(item => ({ id: item.id, primary: item.title, secondary: item.severity, to: '/alerts?status=OPEN', action: 'ack' as const }))
        : []

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const port = await getApiPort()
      const response = await fetch(`http://127.0.0.1:${port}/api/alerts/${alertId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACKED' })
      })

      if (!response.ok) {
        throw new Error('ACK 失败')
      }

      const workspaceId = localStorage.getItem('soloforge-current-workspace') || '00000000-0000-0000-0000-000000000001'
      const [alertsRes, hostAgentRes, operationsRes] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/alerts?workspaceId=${encodeURIComponent(workspaceId)}&status=OPEN`),
        fetch(`http://127.0.0.1:${port}/api/host-agents/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`),
        fetch(`http://127.0.0.1:${port}/api/operations?workspaceId=${encodeURIComponent(workspaceId)}&status=RUNNING`)
      ])

      const alertsJson = await alertsRes.json() as { success?: boolean; data?: Array<{ id: string; title: string; severity: string }> }
      const hostAgentJson = await hostAgentRes.json() as { success?: boolean; data?: HostAgentDashboardStats }
      const operationsJson = await operationsRes.json() as { success?: boolean; data?: Array<{ id: string; title: string; status: string }> }

      setRuntimePreview(prev => ({
        ...prev,
        alerts: alertsJson.success && Array.isArray(alertsJson.data) ? alertsJson.data.slice(0, 3) : []
      }))
      setRuntimeSummary({
        onlineAgents: hostAgentJson.success && hostAgentJson.data ? hostAgentJson.data.onlineAgents + hostAgentJson.data.degradedAgents : runtimeSummary.onlineAgents,
        openAlerts: alertsJson.success && Array.isArray(alertsJson.data) ? alertsJson.data.length : runtimeSummary.openAlerts,
        runningOperations: operationsJson.success && Array.isArray(operationsJson.data) ? operationsJson.data.length : runtimeSummary.runningOperations
      })
    } catch (error) {
      console.error('Failed to acknowledge alert from topbar preview:', error)
    }
  }

  // 连接状态指示器
  const ConnectionIndicator = () => {
    const statusConfig = {
      connected: {
        color: 'bg-[hsl(var(--success))]',
        label: '已连接',
        tone: 'bg-[hsl(var(--google-green)_/_0.12)] text-[hsl(var(--foreground))] border-[hsl(var(--google-green)_/_0.18)]',
      },
      disconnected: {
        color: 'bg-[hsl(var(--destructive))]',
        label: '未连接',
        tone: 'bg-[hsl(var(--google-red)_/_0.12)] text-[hsl(var(--foreground))] border-[hsl(var(--google-red)_/_0.16)]',
      },
    }

    const config = statusConfig[connectionStatus]

    return (
      <div className={`inline-flex items-center gap-3 rounded-full border px-3.5 py-2 shadow-workshop-sm ${config.tone}`}>
        <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-none">{currentProfile}</span>
          <span className="mt-1 text-[11px] leading-none text-[hsl(var(--muted-foreground))]">{config.label}</span>
        </div>
      </div>
    )
  }

  return (
    <header
      data-testid="app-topbar"
      className="relative flex h-16 items-center overflow-hidden rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,hsl(var(--card)_/_0.96),hsl(var(--card)_/_0.84))] px-4 shadow-workshop-sm backdrop-blur supports-[backdrop-filter]:bg-[linear-gradient(180deg,hsl(var(--card)_/_0.9),hsl(var(--card)_/_0.8))] sm:px-5 lg:px-6"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--google-blue)_/_0.55),transparent)]" />
      {/* 左侧：全局搜索 */}
      <div className="flex w-full items-center justify-between gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="hidden min-w-0 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.56),hsl(var(--background)_/_0.34))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] xl:block">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">SoloForge Console</div>
            <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]">工作台导航与全局搜索</div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.62)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.5),hsl(var(--background)_/_0.3))] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] 2xl:flex">
            {quickLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-all duration-200 hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              >
                <span className="font-medium text-[hsl(var(--foreground))]">{link.label}</span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{link.hint}</span>
              </Link>
            ))}
          </div>

          <div ref={previewRef} className="relative hidden items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.62)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.48),hsl(var(--background)_/_0.28))] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] 2xl:flex">
            <button
              type="button"
              aria-expanded={activePreview === 'status-center'}
              aria-haspopup="dialog"
              onClick={() => setActivePreview(current => current === 'status-center' ? null : 'status-center')}
              className="group inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.62),hsl(var(--background)_/_0.42))] px-3 py-1.5 text-left transition-colors duration-200 hover:bg-[hsl(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--google-blue)_/_0.24)]"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">Status Center</span>
                <span className="mt-0.5 text-[10px] leading-none text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">集中查看 Agent / Jobs / Alerts</span>
              </div>
            </button>

            {runtimePills.map(pill => (
              <button
                key={pill.label}
                type="button"
                onClick={() => setActivePreview(current => current === pill.key ? null : pill.key)}
                aria-expanded={activePreview === pill.key}
                aria-haspopup="dialog"
                className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors duration-200 hover:bg-[hsl(var(--accent))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--google-blue)_/_0.24)] ${pill.tone}`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{pill.label}</span>
                  <span className="mt-0.5 text-[10px] leading-none text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{pill.description}</span>
                </div>
                <span className={`rounded-full bg-[hsl(var(--card))] px-2 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ${pill.valueTone}`}>
                  {pill.value}
                </span>
              </button>
            ))}

            {activePreview && activePreview !== 'status-center' && (
              <div
                role="dialog"
                aria-label="运行态预览"
                className="absolute left-0 top-full z-50 mt-3 w-[24rem] rounded-workshop-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover)_/_0.98)] p-4 shadow-workshop-md backdrop-blur transition-[opacity,transform] duration-200"
              >
                <div className="flex items-center justify-between pb-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">运行态预览</div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
                      {runtimePills.find(pill => pill.key === activePreview)?.label}
                    </div>
                  </div>
                  <Link
                    to={runtimePills.find(pill => pill.key === activePreview)?.to || '/'}
                    onClick={() => setActivePreview(null)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    查看全部
                  </Link>
                </div>

                <div className="space-y-2">
                  {activePreviewItems.length > 0 ? activePreviewItems.map(item => (
                    <div key={item.id} className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] px-3 py-3 transition-colors duration-200 hover:bg-[hsl(var(--accent))]">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          to={item.to}
                          onClick={() => setActivePreview(null)}
                          className="min-w-0 flex-1"
                        >
                          <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{item.primary}</div>
                          <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.secondary}</div>
                        </Link>
                        {item.action === 'ack' ? (
                          <button
                            type="button"
                            onClick={() => void acknowledgeAlert(item.id)}
                            className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.12)] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--google-yellow)_/_0.2)]"
                          >
                            ACK
                          </button>
                        ) : (
                          <Link
                            to={item.to}
                            onClick={() => setActivePreview(null)}
                            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--google-blue))] transition-colors hover:bg-[hsl(var(--accent))]"
                          >
                            查看
                          </Link>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-workshop-md border border-dashed border-[hsl(var(--border))] px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">
                      当前没有可预览的项目。
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePreview === 'status-center' && (
              <div
                role="dialog"
                aria-label="全局状态中心"
                className="absolute left-0 top-full z-50 mt-3 w-[30rem] rounded-workshop-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover)_/_0.98)] p-4 shadow-workshop-md backdrop-blur transition-[opacity,transform] duration-200"
              >
                <div className="flex items-center justify-between pb-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Status Center</div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">全局运行态总览</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePreview(null)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                  >
                    关闭
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {runtimePills.map(pill => (
                    <button
                      key={pill.label}
                      type="button"
                      onClick={() => setActivePreview(pill.key)}
                      className={`rounded-workshop-md border p-3 text-left transition-colors hover:bg-[hsl(var(--accent))] ${pill.tone}`}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{pill.label}</div>
                      <div className={`mt-2 text-2xl font-semibold ${pill.valueTone}`}>{pill.value}</div>
                      <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{pill.description}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Agent 预览</div>
                    <div className="mt-2 space-y-2">
                      {runtimePreview.agents.length > 0 ? runtimePreview.agents.map(item => (
                        <Link key={item.id} to={`/host-agents/${item.id}`} onClick={() => setActivePreview(null)} className="block text-sm text-[hsl(var(--foreground))] hover:text-[hsl(var(--google-blue))]">
                          {item.name} <span className="text-[hsl(var(--muted-foreground))]">· {item.status}</span>
                        </Link>
                      )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无在线 Agent 预览</div>}
                    </div>
                  </div>

                  <div className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Operation 预览</div>
                    <div className="mt-2 space-y-2">
                      {runtimePreview.operations.length > 0 ? runtimePreview.operations.map(item => (
                        <Link key={item.id} to="/operations?status=RUNNING" onClick={() => setActivePreview(null)} className="block text-sm text-[hsl(var(--foreground))] hover:text-[hsl(var(--google-blue))]">
                          {item.title} <span className="text-[hsl(var(--muted-foreground))]">· {item.status}</span>
                        </Link>
                      )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">当前没有运行中的 Jobs</div>}
                    </div>
                  </div>

                  <div className="rounded-workshop-md border border-[hsl(var(--border)_/_0.82)] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Alert 预览</div>
                    <div className="mt-2 space-y-2">
                      {runtimePreview.alerts.length > 0 ? runtimePreview.alerts.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <Link to="/alerts?status=OPEN" onClick={() => setActivePreview(null)} className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--foreground))] hover:text-[hsl(var(--google-blue))]">
                            {item.title} <span className="text-[hsl(var(--muted-foreground))]">· {item.severity}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => void acknowledgeAlert(item.id)}
                            className="rounded-full border border-[hsl(var(--google-yellow)_/_0.24)] bg-[hsl(var(--google-yellow)_/_0.12)] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--google-yellow)_/_0.2)]"
                          >
                            ACK
                          </button>
                        </div>
                      )) : <div className="text-sm text-[hsl(var(--muted-foreground))]">暂无需要处理的 Alerts</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative max-w-3xl flex-1">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--google-blue))]"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
               <input
                 type="text"
                 placeholder="搜索工单、审批、审计日志..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full rounded-full border border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.82),hsl(var(--background)_/_0.68))] py-3 pl-11 pr-16 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] placeholder:text-[hsl(var(--muted-foreground))] transition-[border-color,box-shadow,background-color] duration-200 focus:border-[hsl(var(--google-blue)_/_0.45)] focus:bg-[hsl(var(--card))] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--google-blue)_/_0.14)]"
               />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors duration-200 hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
                >
                  清空
                </button>
              )}
            </div>
          </form>

          {(searching || searchError || searchResults) && (
            <div className="absolute left-0 top-full z-50 mt-3 w-full max-h-[32rem] overflow-y-auto rounded-workshop-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover)_/_0.98)] shadow-workshop-md backdrop-blur">
              {searching && (
                <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">搜索中...</div>
              )}

             {!searching && searchError && (
                <div className="px-4 py-3 text-sm text-[hsl(var(--destructive))]">{searchError}</div>
              )}

              {!searching && searchResults && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">
                    <span>搜索结果</span>
                    <span>{totalResults} 条</span>
                  </div>

                 <SearchSection title="工单" emptyText="未找到相关工单">
                   {searchResults.tickets.map(ticket => (
                      <Link
                        key={ticket.id}
                        to={`/tickets/${ticket.id}`}
                        onClick={() => setSearchResults(null)}
                        className="block rounded-workshop-md border border-[hsl(var(--border))] px-3 py-3 transition-colors duration-200 hover:bg-[hsl(var(--accent))]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{ticket.title}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {ticket.source} · {ticket.status} · {ticket.priority}
                       </div>
                     </Link>
                   ))}
                 </SearchSection>

                 <SearchSection title="审批" emptyText="未找到相关审批">
                   {searchResults.approvals.map(approval => (
                      <Link
                        key={approval.id}
                        to="/approvals"
                        onClick={() => setSearchResults(null)}
                        className="block rounded-workshop-md border border-[hsl(var(--border))] px-3 py-3 transition-colors duration-200 hover:bg-[hsl(var(--accent))]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{approval.actionType}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {approval.status} · {approval.requestedBy} · {approval.ticketId || '无工单'}
                       </div>
                     </Link>
                   ))}
                 </SearchSection>

                 <SearchSection title="审计日志" emptyText="未找到相关审计日志">
                   {searchResults.auditLogs.map(log => (
                      <Link
                        key={log.id}
                        to={`/audit?traceId=${encodeURIComponent(log.traceId)}`}
                        onClick={() => setSearchResults(null)}
                        className="block rounded-workshop-md border border-[hsl(var(--border))] px-3 py-3 transition-colors duration-200 hover:bg-[hsl(var(--accent))]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{log.action}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {log.actor} · {new Date(log.ts).toLocaleString('zh-CN')} · {log.traceId}
                       </div>
                     </Link>
                   ))}
                 </SearchSection>
               </div>
             )}
            </div>
           )}
          </div>
        </div>

          {/* 右侧：快捷摘要 + 连接状态 + 主题切换 */}
           <div data-testid="topbar-actions" className="flex shrink-0 items-center gap-2 self-stretch rounded-full border border-[hsl(var(--border)_/_0.55)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.4),hsl(var(--background)_/_0.26))] px-1.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
             <div className="hidden items-center gap-1 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.66)] px-2 py-1 lg:flex">
               <Link to="/operations" className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]">
                 Operations
               </Link>
               <Link to="/alerts" className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]">
                 Alerts
               </Link>
             </div>
             <div className="hidden min-w-0 rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.62),hsl(var(--background)_/_0.42))] px-3 py-2 text-[11px] leading-none text-[hsl(var(--muted-foreground))] xl:block">
               <div className="font-semibold uppercase tracking-[0.16em]">Quick Access</div>
               <div className="mt-1 truncate text-[hsl(var(--foreground))]">部署、宿主机、事件流与运行态入口</div>
             </div>
             <ConnectionIndicator />
             <div className="rounded-full border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] shadow-workshop-sm">
               <ThemeToggle />
             </div>
           </div>
        </div>
    </header>
  )
}

interface SearchSectionProps {
  title: string
  emptyText: string
  children: React.ReactNode
}

function SearchSection({ title, emptyText, children }: SearchSectionProps) {
  const items = React.Children.toArray(children)

  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{title}</div>
      {items.length > 0 ? items : <div className="text-xs text-[hsl(var(--muted-foreground))] px-1 py-2">{emptyText}</div>}
    </section>
  )
}
