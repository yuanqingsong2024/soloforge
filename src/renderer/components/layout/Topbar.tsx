import { formatDateTime } from '../../lib/i18n-formatters'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '../LanguageToggle'
import { ThemeToggle } from '../ThemeToggle'
import { apiFetch, ApiResponse } from '../../lib/api'
import { useDebounce } from '../../hooks/useDebounce'
import { translateEnum } from '../../lib/i18n-helpers'
import { readWorkspaceId } from '../../lib/storage'

function getCurrentWorkspaceId(): string {
  return readWorkspaceId()
}

function appendWorkspaceContext(route: string, workspaceId: string): string {
  const [path, search = ''] = route.split('?')
  const params = new URLSearchParams(search)
  if (workspaceId) {
    params.set('workspaceId', workspaceId)
  }
  const nextSearch = params.toString()
  return nextSearch ? `${path}?${nextSearch}` : path
}

function formatDoctorAlertTitle(t: (key: string) => string, title: string): string {
  const prefix = 'Doctor Alert · '
  if (!title.startsWith(prefix)) {
    return title
  }

  const category = title.slice(prefix.length).trim()
  const translatedCategory = translateEnum(t, 'doctorCategoryMap', category)
  const translatedPrefix = t('navigation:topbar.doctorAlert')
  return `${translatedPrefix} · ${translatedCategory}`
}

function formatDoctorAlertSeverity(t: (key: string) => string, severity: string): string {
  return translateEnum(t, 'severityMap', severity)
}

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

interface OpenClawConnectionStatus {
  connected: boolean
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
  const { t } = useTranslation(['navigation', 'common'])
  const workspaceId = getCurrentWorkspaceId()
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 500)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [currentProfile, setCurrentProfile] = useState<string>(t('navigation:topbar.connection.notConnected'))
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
        const response = await apiFetch<{ id: string; name?: string }[]>('/api/comms/profiles')
        if (!Array.isArray(response)) {
          setCurrentProfile(t('navigation:topbar.connection.notConnected'))
          setConnectionStatus('disconnected')
          return
        }

        // 获取每个 CommsProfile 关联的 ConnectionProfile 状态
        const statusResults = await Promise.all(response.map(async profile => {
          try {
            // 使用关联的 ConnectionProfile ID，而不是 CommsProfile ID
            const profileId = (profile as { claudeCodeProfile?: { id: string } }).claudeCodeProfile?.id
            if (!profileId) return { profile, connected: false }
            const status = await apiFetch<OpenClawConnectionStatus>(`/api/openclaw/${profileId}/status`)
            return { profile, connected: status.connected }
          } catch {
            return { profile, connected: false }
          }
        }))

        const connectedProfile = statusResults.find(result => result.connected)?.profile
        if (connectedProfile) {
          setCurrentProfile(connectedProfile.name || t('navigation:topbar.connection.connected'))
          setConnectionStatus('connected')
        } else {
          setCurrentProfile(t('navigation:topbar.connection.notConnected'))
          setConnectionStatus('disconnected')
        }
      } catch {
        setConnectionStatus('disconnected')
        setCurrentProfile(t('navigation:topbar.connection.notConnected'))
      }
    }

    void checkConnection()
    const interval = setInterval(() => void checkConnection(), 10000) // 每 10 秒检查一次
    return () => clearInterval(interval)
  }, [t])

  useEffect(() => {
    const loadRuntimeSummary = async () => {
      // workspaceId 为空时跳过汇总加载
      if (!workspaceId) {
        return
      }
      try {
        const [hostAgentRes, alertsRes, operationsRes, hostAgentListRes] = await Promise.all([
          apiFetch<ApiResponse<HostAgentDashboardStats>>(`/api/host-agents/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`),
          apiFetch<ApiResponse<Array<{ id: string; title: string; severity: string }>>>(`/api/alerts?workspaceId=${encodeURIComponent(workspaceId)}&status=OPEN`),
          apiFetch<ApiResponse<Array<{ id: string; title: string; status: string }>>>(`/api/operations?workspaceId=${encodeURIComponent(workspaceId)}&status=RUNNING`),
          apiFetch<ApiResponse<Array<{ id: string; name: string; status: string }>>>(`/api/host-agents?workspaceId=${encodeURIComponent(workspaceId)}&status=ONLINE`)
        ])

        const hostAgentData = hostAgentRes.success ? hostAgentRes.data : null
        const alertsData = alertsRes.success ? alertsRes.data : []
        const operationsData = operationsRes.success ? operationsRes.data : []
        const hostAgentListData = hostAgentListRes.success ? hostAgentListRes.data : []

        setRuntimeSummary({
          onlineAgents: hostAgentData ? hostAgentData.onlineAgents + hostAgentData.degradedAgents : 0,
          openAlerts: Array.isArray(alertsData) ? alertsData.length : 0,
          runningOperations: Array.isArray(operationsData) ? operationsData.length : 0
        })
        setRuntimePreview({
          agents: Array.isArray(hostAgentListData) ? hostAgentListData.slice(0, 3) : [],
          operations: Array.isArray(operationsData) ? operationsData.slice(0, 3) : [],
          alerts: Array.isArray(alertsData) ? alertsData.slice(0, 3) : []
        })
      } catch {
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
  }, [workspaceId])

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

  // 防抖搜索
  useEffect(() => {
    const performSearch = async () => {
      const query = debouncedSearchQuery.trim()
      if (!query) {
        setSearchResults(null)
        setSearchError(null)
        return
      }

      setSearching(true)
      setSearchError(null)
      try {
        const params = new URLSearchParams({ q: query, workspaceId })
        const result = await apiFetch<ApiResponse<SearchResponse>>(`/api/search?${params.toString()}`)
        if (!result.success || !result.data) {
          throw new Error(result.error || t('navigation:topbar.search.failed'))
        }
        setSearchResults(result.data)
      } catch (error) {
        setSearchResults(null)
        setSearchError(error instanceof Error ? error.message : t('navigation:topbar.search.failed'))
      } finally {
        setSearching(false)
      }
    }

    void performSearch()
  }, [debouncedSearchQuery, workspaceId, t])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
    setSearchError(null)
  }

  const runtimePills = [
    {
      key: 'agents' as const,
      to: appendWorkspaceContext('/host-agents?status=ONLINE', workspaceId),
      label: t('navigation:topbar.runtime.onlineAgents'),
      value: runtimeSummary.onlineAgents,
      description: runtimeSummary.onlineAgents > 0 ? t('navigation:topbar.runtime.healthy') : t('navigation:topbar.runtime.waitingOnline'),
      tone: runtimeSummary.onlineAgents > 0
        ? 'border-[hsl(var(--google-green)_/_0.22)] bg-[hsl(var(--google-green)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.onlineAgents > 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]'
    },
    {
      key: 'operations' as const,
      to: appendWorkspaceContext('/operations?status=RUNNING', workspaceId),
      label: t('navigation:topbar.runtime.runningJobs'),
      value: runtimeSummary.runningOperations,
      description: runtimeSummary.runningOperations > 0 ? t('navigation:topbar.runtime.systemBusy') : t('navigation:topbar.runtime.currentIdle'),
      tone: runtimeSummary.runningOperations > 0
        ? 'border-[hsl(var(--google-blue)_/_0.22)] bg-[hsl(var(--google-blue)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.runningOperations > 0 ? 'text-[hsl(var(--google-blue))]' : 'text-[hsl(var(--muted-foreground))]'
    },
    {
      key: 'alerts' as const,
      to: appendWorkspaceContext('/health-monitoring?tab=alerts&status=OPEN', workspaceId),
      label: t('navigation:topbar.runtime.unresolvedAlerts'),
      value: runtimeSummary.openAlerts,
      description: runtimeSummary.openAlerts > 0 ? t('navigation:topbar.runtime.needsAttention') : t('navigation:topbar.runtime.noAlerts'),
      tone: runtimeSummary.openAlerts > 0
        ? 'border-[hsl(var(--google-red)_/_0.22)] bg-[hsl(var(--google-red)_/_0.1)]'
        : 'border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.62)]',
      valueTone: runtimeSummary.openAlerts > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'
    }
  ]

  const activePreviewItems = activePreview === 'agents'
    ? runtimePreview.agents.map(item => ({ id: item.id, primary: item.name, secondary: translateEnum(t, 'commonStatusMap', item.status), to: `/host-agents/${item.id}`, action: null as null | 'ack' }))
    : activePreview === 'operations'
      ? runtimePreview.operations.map(item => ({ id: item.id, primary: item.title, secondary: translateEnum(t, 'operationStatusMap', item.status), to: appendWorkspaceContext('/operations?status=RUNNING', workspaceId), action: null as null | 'ack' }))
    : activePreview === 'alerts'
        ? runtimePreview.alerts.map(item => ({ id: item.id, primary: formatDoctorAlertTitle(t, item.title), secondary: formatDoctorAlertSeverity(t, item.severity), to: appendWorkspaceContext('/health-monitoring?tab=alerts&status=OPEN', workspaceId), action: 'ack' as const }))
        : []

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await apiFetch(`/api/alerts/${alertId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'ACKED' })
      })

      const [alertsRes, hostAgentRes, operationsRes] = await Promise.all([
        apiFetch<ApiResponse<Array<{ id: string; title: string; severity: string }>>>('/api/alerts', {
          headers: { 'workspaceId': workspaceId, 'status': 'OPEN' }
        }),
        apiFetch<ApiResponse<HostAgentDashboardStats>>('/api/host-agents/dashboard', {
          headers: { 'workspaceId': workspaceId }
        }),
        apiFetch<ApiResponse<Array<{ id: string; title: string; status: string }>>>('/api/operations', {
          headers: { 'workspaceId': workspaceId, 'status': 'RUNNING' }
        })
      ])

      const alertsData = alertsRes.success ? alertsRes.data : []
      const hostAgentData = hostAgentRes.success ? hostAgentRes.data : null
      const operationsData = operationsRes.success ? operationsRes.data : []

      setRuntimePreview(prev => ({
        ...prev,
        alerts: Array.isArray(alertsData) ? alertsData.slice(0, 3) : []
      }))
      setRuntimeSummary({
        onlineAgents: hostAgentData ? hostAgentData.onlineAgents + hostAgentData.degradedAgents : runtimeSummary.onlineAgents,
        openAlerts: Array.isArray(alertsData) ? alertsData.length : runtimeSummary.openAlerts,
        runningOperations: Array.isArray(operationsData) ? operationsData.length : runtimeSummary.runningOperations
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
        label: t('navigation:topbar.connection.connected'),
        tone: 'bg-[hsl(var(--google-green)_/_0.08)] text-[hsl(var(--foreground))] border-[hsl(var(--google-green)_/_0.14)]',
      },
      disconnected: {
        color: 'bg-[hsl(var(--destructive))]',
        label: t('navigation:topbar.connection.notConnected'),
        tone: 'bg-[hsl(var(--google-red)_/_0.08)] text-[hsl(var(--foreground))] border-[hsl(var(--google-red)_/_0.14)]',
      },
    }

    const config = statusConfig[connectionStatus]
    const shouldShowSecondLine = connectionStatus === 'connected' && currentProfile !== config.label

      return (
        <div className={`inline-flex min-h-9 min-w-[12rem] max-w-[14rem] items-center gap-2 rounded-full border px-3.5 py-1 shadow-[0_4px_12px_rgba(60,64,67,0.04)] ${config.tone}`}>
          <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span className="text-sm font-medium leading-tight whitespace-normal break-words">{currentProfile}</span>
          {shouldShowSecondLine && (
            <span className="mt-1 text-[11px] leading-tight text-[hsl(var(--muted-foreground))]">{config.label}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <header
      data-testid="app-topbar"
      className="relative flex min-h-14 items-center overflow-visible rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card))]/95 px-5 py-2.5 backdrop-blur-xl shadow-[var(--shadow-soft)] transition-all duration-200"
    >
      {/* 主布局：左中右三栏 */}
      <div className="flex w-full flex-wrap items-center gap-3 xl:gap-2 xl:flex-nowrap">
        {/* 左侧：品牌标识 + 搜索 */}
        <div className="order-1 flex min-w-0 flex-[1.65] items-center gap-3 xl:max-w-[62rem]">
          {/* 全局搜索 */}
          <div className="relative min-w-0 flex-1 xl:max-w-[52rem]">
          <form onSubmit={handleSearch}>
            <div className="relative group">
              {/* 搜索图标 */}
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <svg
                  className="text-[hsl(var(--muted-foreground))] transition-colors group-focus-within:text-[hsl(var(--primary))]"
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
              </div>
              
              <input
                type="text"
                placeholder={t('navigation:search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--background))]/80 py-3.5 pl-11 pr-12 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.6)] backdrop-blur-sm transition-all duration-200 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-0 focus:bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] focus:shadow-[var(--shadow-soft)] focus:border-2"
              />
              
              {searchQuery ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-all duration-200 hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                >
                  {t('common:buttons.clear')}
                </button>
              ) : (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] sm:block">⌘K</kbd>
              )}
            </div>
          </form>

          {(searching || searchError || searchResults) && (
            <div className="absolute left-0 top-full z-50 mt-3 w-full max-h-[32rem] overflow-y-auto rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--popover))]/98 shadow-[var(--shadow-elevated)] backdrop-blur-lg p-4">
              {searching && (
                <div className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">{t('navigation:search.searching')}</div>
              )}

             {!searching && searchError && (
                <div className="px-4 py-3 text-sm text-[hsl(var(--destructive))]">{searchError}</div>
              )}

              {!searching && searchResults && (
                <div className="p-1 space-y-4">
                  <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">
                    <span>{t('navigation:search.results')}</span>
                    <span>{totalResults} {t('navigation:search.items')}</span>
                  </div>

                 <SearchSection title={t('navigation:search.tickets')} emptyText={t('navigation:search.noTickets')}>
                   {searchResults.tickets.map(ticket => (
                      <Link
                        key={ticket.id}
                        to={`/tickets/${ticket.id}`}
                        onClick={() => setSearchResults(null)}
                        className="block rounded-xl border border-[hsl(var(--border)/0.4)] px-4 py-3 transition-all duration-200 hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--accent)/0.3)] hover:shadow-[var(--shadow-sm)]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{ticket.title}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {ticket.source} · {ticket.status} · {ticket.priority}
                       </div>
                     </Link>
                   ))}
                 </SearchSection>

                 <SearchSection title={t('navigation:search.approvals')} emptyText={t('navigation:search.noApprovals')}>
                   {searchResults.approvals.map(approval => (
                      <Link
                        key={approval.id}
                        to={appendWorkspaceContext('/approvals?status=PENDING', workspaceId)}
                        onClick={() => setSearchResults(null)}
                        className="block rounded-xl border border-[hsl(var(--border)/0.4)] px-4 py-3 transition-all duration-200 hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--accent)/0.3)] hover:shadow-[var(--shadow-sm)]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{approval.actionType}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {approval.status} · {approval.requestedBy} · {approval.ticketId || t('navigation:search.noTicket')}
                       </div>
                     </Link>
                   ))}
                 </SearchSection>

                 <SearchSection title={t('navigation:search.auditLogs')} emptyText={t('navigation:search.noAuditLogs')}>
                   {searchResults.auditLogs.map(log => (
                      <Link
                        key={log.id}
                        to={appendWorkspaceContext(`/audit?traceId=${encodeURIComponent(log.traceId)}`, workspaceId)}
                        onClick={() => setSearchResults(null)}
                        className="block rounded-xl border border-[hsl(var(--border)/0.4)] px-4 py-3 transition-all duration-200 hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--accent)/0.3)] hover:shadow-[var(--shadow-sm)]"
                      >
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{log.action}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                         {log.actor} · {formatDateTime(log.ts)} · {log.traceId}
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

        {/* 中间：运行态指标 */}
        <div ref={previewRef} className="order-3 relative hidden w-full flex-none flex-wrap items-center gap-1.5 rounded-2xl border border-[hsl(var(--border)/0.5)] bg-gradient-to-br from-[hsl(var(--muted))]/40 to-[hsl(var(--muted))]/20 px-2 py-1.5 xl:flex xl:flex-[0.64] shadow-[var(--shadow-sm)]">
          <button
            type="button"
            aria-expanded={activePreview === 'status-center'}
            aria-haspopup="dialog"
            onClick={() => setActivePreview(current => current === 'status-center' ? null : 'status-center')}
            className="group inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--background))]/60 backdrop-blur-sm px-3 py-1.5 text-left transition-all duration-200 hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--primary)/0.2)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)]"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-[hsl(var(--google-blue))] to-[hsl(var(--google-green))]">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <span className="text-[10px] uppercase tracking-[0.12em] font-medium text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{t('navigation:topbar.statusCenter.title')}</span>
          </button>

          {runtimePills.map(pill => (
            <button
              key={pill.label}
              type="button"
              onClick={() => setActivePreview(current => current === pill.key ? null : pill.key)}
              aria-expanded={activePreview === pill.key}
              aria-haspopup="dialog"
              className={`group inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 transition-all duration-200 hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] ${pill.tone}`}
            >
              {pill.key === 'agents' && (
                <span className={`h-1.5 w-1.5 rounded-full ${runtimeSummary.onlineAgents > 0 ? 'bg-[hsl(var(--success))] animate-pulse-status' : 'bg-[hsl(var(--muted-foreground))]'}`} />
              )}
              {pill.key === 'operations' && (
                <span className={`h-1.5 w-1.5 rounded-full ${runtimeSummary.runningOperations > 0 ? 'bg-[hsl(var(--google-blue))] animate-pulse-soft' : 'bg-[hsl(var(--muted-foreground))]'}`} />
              )}
              {pill.key === 'alerts' && (
                <span className={`h-1.5 w-1.5 rounded-full ${runtimeSummary.openAlerts > 0 ? 'bg-[hsl(var(--destructive))] animate-pulse-soft' : 'bg-[hsl(var(--muted-foreground))]'}`} />
              )}
              <span className="text-[10px] uppercase tracking-[0.12em] font-medium text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{pill.label}</span>
              <span className="rounded-full bg-[hsl(var(--card))] px-2 py-0.5 text-[10px] font-bold shadow-[var(--shadow-sm)] ${pill.valueTone}">
                {pill.value}
              </span>
            </button>
          ))}

          {activePreview && activePreview !== 'status-center' && (
            <div
              role="dialog"
              aria-label={t('navigation:topbar.statusCenter.runtimePreview')}
              className="absolute right-0 top-full z-50 mt-3 max-h-[calc(100vh-12rem)] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--popover))]/98 p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl transition-all duration-200"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[hsl(var(--border)/0.4)]">
                <div>
                  <div className="text-base font-semibold text-[hsl(var(--foreground))]">
                    {runtimePills.find(pill => pill.key === activePreview)?.label}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t('navigation:topbar.statusCenter.runtimePreview')}</div>
                </div>
                <Link
                  to={runtimePills.find(pill => pill.key === activePreview)?.to || '/'}
                  onClick={() => setActivePreview(null)}
                  className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[hsl(var(--primary-hover))] hover:shadow-lg hover:-translate-y-0.5"
                >
                  {t('common:buttons.viewAll')}
                </Link>
              </div>

              <div className="mt-4 space-y-2">
                {activePreviewItems.length > 0 ? activePreviewItems.map(item => (
                  <div key={item.id} className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--background))]/50 px-4 py-3 transition-all duration-200 hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--accent)/0.2)] hover:shadow-[var(--shadow-sm)]">
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
                          className="rounded-xl border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.1)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--warning)/0.2)] hover:shadow-sm"
                        >
                          {t('common:buttons.ack')}
                        </button>
                      ) : (
                        <Link
                          to={item.to}
                          onClick={() => setActivePreview(null)}
                          className="rounded-xl bg-[hsl(var(--primary))]/10 px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--primary))] transition-all hover:bg-[hsl(var(--primary))]/20"
                        >
                          {t('common:buttons.view')}
                        </Link>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-sm text-[hsl(var(--muted-foreground))] text-center">
                    {t('navigation:topbar.statusCenter.noPreview')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activePreview === 'status-center' && (
            <div
              role="dialog"
              aria-label={t('navigation:topbar.statusCenter.title')}
              className="absolute right-0 top-full z-50 mt-3 max-h-[calc(100vh-12rem)] w-[32rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--popover))]/98 p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl transition-all duration-200"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[hsl(var(--border)/0.4)]">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] font-medium text-[hsl(var(--muted-foreground))]">{t('navigation:topbar.statusCenter.title')}</div>
                  <div className="mt-1 text-base font-semibold text-[hsl(var(--foreground))]">{t('navigation:topbar.globalRuntimeOverview')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePreview(null)}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                >
                  {t('common:buttons.close')}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {runtimePills.map(pill => (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => setActivePreview(pill.key)}
                    className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${pill.tone}`}
                  >
                    <div className="text-[11px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--muted-foreground))]">{pill.label}</div>
                    <div className={`mt-2 text-2xl font-bold ${pill.valueTone}`}>{pill.value}</div>
                    <div className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">{pill.description}</div>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3">
                <div className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--background))]/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] font-medium text-[hsl(var(--muted-foreground))]">
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse-status" />
                    {t('navigation:topbar.agentPreview')}
                  </div>
                  <div className="mt-3 space-y-2">
                    {runtimePreview.agents.length > 0 ? runtimePreview.agents.map(item => (
                      <Link key={item.id} to={`/host-agents/${item.id}`} onClick={() => setActivePreview(null)} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors">
                        <span>{item.name}</span>
                        <span className="text-[hsl(var(--muted-foreground))]">{translateEnum(t, 'commonStatusMap', item.status)}</span>
                      </Link>
                    )) : <div className="py-2 text-sm text-[hsl(var(--muted-foreground))]">{t('navigation:topbar.noOnlineAgents')}</div>}
                  </div>
                </div>

                <div className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--background))]/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] font-medium text-[hsl(var(--muted-foreground))]">
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--google-blue))]" />
                    {t('navigation:topbar.operationPreview')}
                  </div>
                  <div className="mt-3 space-y-2">
                    {runtimePreview.operations.length > 0 ? runtimePreview.operations.map(item => (
                      <Link key={item.id} to={appendWorkspaceContext('/operations?status=RUNNING', workspaceId)} onClick={() => setActivePreview(null)} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors">
                        <span className="truncate">{item.title}</span>
                        <span className="text-[hsl(var(--muted-foreground))] shrink-0">{translateEnum(t, 'operationStatusMap', item.status)}</span>
                      </Link>
                    )) : <div className="py-2 text-sm text-[hsl(var(--muted-foreground))]">{t('navigation:topbar.noRunningJobs')}</div>}
                  </div>
                </div>

                <div className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--background))]/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] font-medium text-[hsl(var(--muted-foreground))]">
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--destructive))]" />
                    {t('navigation:topbar.alertPreview')}
                  </div>
                  <div className="mt-3 space-y-2">
                    {runtimePreview.alerts.length > 0 ? runtimePreview.alerts.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                        <Link to={appendWorkspaceContext('/health-monitoring?tab=alerts&status=OPEN', workspaceId)} onClick={() => setActivePreview(null)} className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))]">
                          {formatDoctorAlertTitle(t, item.title)} · {formatDoctorAlertSeverity(t, item.severity)}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void acknowledgeAlert(item.id)}
                          className="rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.1)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--foreground))] shrink-0 transition-all hover:bg-[hsl(var(--warning)/0.2)]"
                        >
                          {t('common:buttons.ack')}
                        </button>
                      </div>
                    )) : <div className="py-2 text-sm text-[hsl(var(--muted-foreground))]">{t('navigation:topbar.noAlertsToHandle')}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：连接状态 + 操作按钮 */}
        <div data-testid="topbar-actions" className="order-2 flex shrink-0 items-center gap-2">
          <ConnectionIndicator />
          <div className="h-6 w-px bg-[hsl(var(--border)/0.4)]" />
          <Link 
            to="/help" 
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]" 
            title={t('navigation:topbar.help')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </Link>
          <LanguageToggle />
          <ThemeToggle />
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
