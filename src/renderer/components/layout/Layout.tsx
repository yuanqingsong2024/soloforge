import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useTheme } from '../../contexts/ThemeContext'

function getTitleContext(pathname: string, t: (key: string) => string): { section: string; page: string } {
  if (pathname === '/') return { section: t('navigation:sections.workspace'), page: t('navigation:pageTitle.dashboard') }
  if (pathname.startsWith('/tickets/')) return { section: t('navigation:sections.tickets'), page: t('navigation:pageTitle.ticketDetail') }
  if (pathname.startsWith('/tickets')) return { section: t('navigation:sections.tickets'), page: t('navigation:pageTitle.tickets') }
  if (pathname.startsWith('/team')) return { section: t('navigation:sections.organization'), page: t('navigation:pageTitle.team') }
  if (pathname.startsWith('/approvals')) return { section: t('navigation:sections.approval'), page: t('navigation:pageTitle.approvals') }
  if (pathname.startsWith('/audit')) return { section: t('navigation:sections.audit'), page: t('navigation:pageTitle.audit') }
  if (pathname.startsWith('/connection')) return { section: t('navigation:sections.connection'), page: t('navigation:pageTitle.connection') }
  if (pathname.startsWith('/openclaw-config')) return { section: t('navigation:sections.connection'), page: t('navigation:pageTitle.openclawConfig') }
  if (pathname.startsWith('/communications')) return { section: t('navigation:sections.communications'), page: t('navigation:pageTitle.communications') }
  if (pathname.startsWith('/contacts')) return { section: t('navigation:sections.communications'), page: t('navigation:pageTitle.contacts') }
  if (pathname.startsWith('/outbound-messages')) return { section: t('navigation:sections.communications'), page: t('navigation:pageTitle.outboundMessages') }
  if (pathname.startsWith('/outbox')) return { section: t('navigation:sections.communications'), page: t('navigation:pageTitle.outbox') }
  if (pathname.startsWith('/backup')) return { section: t('navigation:sections.data'), page: t('navigation:pageTitle.backup') }
  if (pathname.startsWith('/changes/')) return { section: t('navigation:sections.changes'), page: t('navigation:pageTitle.changeDetail') }
  if (pathname.startsWith('/changes')) return { section: t('navigation:sections.changes'), page: t('navigation:pageTitle.changes') }
  if (pathname.startsWith('/health-monitoring')) return { section: t('navigation:sections.inspection'), page: t('navigation:pageTitle.healthMonitoring') }
  if (pathname.startsWith('/activity-feed')) return { section: t('navigation:sections.runtime'), page: t('navigation:pageTitle.activityFeed') }
  if (pathname.startsWith('/operations')) return { section: t('navigation:sections.runtime'), page: t('navigation:pageTitle.operations') }
  if (pathname.startsWith('/notification-policies')) return { section: t('navigation:sections.runtime'), page: t('navigation:pageTitle.notificationPolicies') }
  if (pathname.startsWith('/releases')) return { section: t('navigation:sections.release'), page: t('navigation:pageTitle.releases') }
  if (pathname.startsWith('/upgrade-plans')) return { section: t('navigation:sections.release'), page: t('navigation:pageTitle.upgradePlans') }
  if (pathname.startsWith('/upgrade-runs')) return { section: t('navigation:sections.release'), page: t('navigation:pageTitle.upgradeRuns') }
  if (pathname.startsWith('/release-policies')) return { section: t('navigation:sections.release'), page: t('navigation:pageTitle.releasePolicies') }
  if (pathname.startsWith('/maintenance-windows')) return { section: t('navigation:sections.release'), page: t('navigation:pageTitle.maintenanceWindows') }
  if (pathname.startsWith('/host-agents/new')) return { section: t('navigation:sections.hostAgents'), page: t('navigation:pageTitle.bootstrapWizard') }
  if (pathname.startsWith('/host-agents/')) return { section: t('navigation:sections.hostAgents'), page: t('navigation:pageTitle.agentDetail') }
  if (pathname.startsWith('/host-agents')) return { section: t('navigation:sections.hostAgents'), page: t('navigation:pageTitle.hostAgents') }
  if (pathname.startsWith('/agent-actions')) return { section: t('navigation:sections.hostAgents'), page: t('navigation:pageTitle.agentActions') }
  if (pathname.startsWith('/workspace-settings')) return { section: t('navigation:sections.workspace'), page: t('navigation:pageTitle.workspaceSettings') }
  if (pathname.startsWith('/deployments/new')) return { section: t('navigation:sections.deployment'), page: t('navigation:pageTitle.deploymentWizard') }
  if (pathname.startsWith('/deployments/')) return { section: t('navigation:sections.deployment'), page: t('navigation:pageTitle.deploymentDetail') }
  if (pathname.startsWith('/deployments')) return { section: t('navigation:sections.deployment'), page: t('navigation:pageTitle.deployments') }
  return { section: t('navigation:sections.workspace'), page: t('navigation:pageTitle.controlCenter') }
}

function getTitleContextAction(pathname: string): { backTo: string; id?: string } | null {
  const ticketMatch = pathname.match(/^\/tickets\/([^/]+)$/)
  if (ticketMatch) return { backTo: '/tickets', id: ticketMatch[1] }

  const changeMatch = pathname.match(/^\/changes\/([^/]+)$/)
  if (changeMatch) return { backTo: '/changes', id: changeMatch[1] }

  const deploymentMatch = pathname.match(/^\/deployments\/([^/]+)$/)
  if (deploymentMatch) return { backTo: '/deployments', id: deploymentMatch[1] }

  const hostAgentMatch = pathname.match(/^\/host-agents\/([^/]+)$/)
  if (hostAgentMatch) return { backTo: '/host-agents', id: hostAgentMatch[1] }

  return null
}

async function resolveDynamicTitle(pathname: string): Promise<string | null> {
  const params = new URLSearchParams(window.location.search)
  const apiPort = params.get('apiPort')
  if (!apiPort) return null

  const requestJson = async <T,>(url: string): Promise<T | null> => {
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      return await response.json() as T
    } catch {
      return null
    }
  }

  const changeMatch = pathname.match(/^\/changes\/([^/]+)$/)
  if (changeMatch) {
    const data = await requestJson<{ success?: boolean; data?: { title?: string } }>(`http://127.0.0.1:${apiPort}/api/change-requests/${changeMatch[1]}`)
    return data?.success && data.data?.title ? data.data.title : null
  }

  const ticketMatch = pathname.match(/^\/tickets\/([^/]+)$/)
  if (ticketMatch) {
    const data = await requestJson<{ success?: boolean; data?: { title?: string } }>(`http://127.0.0.1:${apiPort}/api/tickets/${ticketMatch[1]}`)
    return data?.success && data.data?.title ? data.data.title : null
  }

  const deploymentMatch = pathname.match(/^\/deployments\/([^/]+)$/)
  if (deploymentMatch) {
    const data = await requestJson<{ id?: string; name?: string }>(`http://127.0.0.1:${apiPort}/api/deployment-targets/${deploymentMatch[1]}`)
    return data?.name || null
  }

  const hostAgentMatch = pathname.match(/^\/host-agents\/([^/]+)$/)
  if (hostAgentMatch) {
    const data = await requestJson<{ success?: boolean; data?: { name?: string } }>(`http://127.0.0.1:${apiPort}/api/host-agents/${hostAgentMatch[1]}`)
    return data?.success && data.data?.name ? data.data.name : null
  }

  return null
}

function WindowTitleBar() {
  const { t } = useTranslation(['navigation', 'common'])
  const { effectiveTheme } = useTheme()
  const [maximized, setMaximized] = React.useState(false)
  const [platform, setPlatform] = React.useState<NodeJS.Platform>('win32')
  const location = useLocation()
  const navigate = useNavigate()
  const titleContext = React.useMemo(() => getTitleContext(location.pathname, t), [location.pathname, t])
  const titleAction = React.useMemo(() => getTitleContextAction(location.pathname), [location.pathname])
  const [dynamicLabel, setDynamicLabel] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState(false)

  React.useEffect(() => {
    if (typeof window.electronAPI?.getPlatform === 'function') {
      setPlatform(window.electronAPI.getPlatform())
    }

    if (typeof window.electronAPI?.isWindowMaximized !== 'function') {
      return
    }

    const syncMaximized = () => {
      window.electronAPI.isWindowMaximized().then(setMaximized).catch(() => setMaximized(false))
    }

    syncMaximized()
    window.addEventListener('resize', syncMaximized)
    return () => window.removeEventListener('resize', syncMaximized)
  }, [])

  React.useEffect(() => {
    let disposed = false

    const loadDynamicLabel = async () => {
      const label = await resolveDynamicTitle(location.pathname)
      if (!disposed) {
        setDynamicLabel(label)
      }
    }

    void loadDynamicLabel()
    return () => {
      disposed = true
    }
  }, [location.pathname])

  const handleMinimize = async () => {
    if (typeof window.electronAPI?.minimizeWindow !== 'function') {
      return
    }
    await window.electronAPI.minimizeWindow()
  }

  const handleToggleMaximize = async () => {
    if (typeof window.electronAPI?.toggleMaximizeWindow !== 'function') {
      return
    }
    const next = await window.electronAPI.toggleMaximizeWindow()
    setMaximized(next)
  }

  const handleClose = async () => {
    if (typeof window.electronAPI?.closeWindow !== 'function') {
      return
    }
    await window.electronAPI.closeWindow()
  }

  const handleCopyId = async () => {
    if (!titleAction?.id) return
    await navigator.clipboard.writeText(titleAction.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 1500)
  }

  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'
  const isDarkTheme = effectiveTheme === 'dark'
  const titleBarClassName = isDarkTheme
    ? 'border-b border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,hsl(var(--card)_/_0.96),hsl(var(--card)_/_0.84))]'
    : 'border-b border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,hsl(var(--card)_/_0.99),hsl(var(--background)_/_0.94))]'

  const controls = (
    <div className={`flex items-center ${isMac ? 'gap-2 group' : isLinux ? 'gap-2' : ''}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => void handleMinimize()}
        className={`flex items-center justify-center transition-colors ${
          isMac
            ? 'order-2 h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#e1a325] hover:bg-[#ffbd2e]'
            : isLinux
              ? 'h-6 w-6 rounded-full bg-transparent hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              : 'h-8 w-11 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }`}
        aria-label={t('common:window.minimize')}
      >
        <span className={`${isMac ? 'opacity-0 group-hover:opacity-100 transition-opacity bg-[#995700] h-[1px] w-2' : 'block bg-current h-px w-2.5'}`} />
      </button>
      <button
        type="button"
        onClick={() => void handleToggleMaximize()}
        className={`flex items-center justify-center transition-colors ${
          isMac
            ? 'order-3 h-3 w-3 rounded-full bg-[#28c940] border border-[#1dad2b] hover:bg-[#28c940]'
            : isLinux
              ? 'h-6 w-6 rounded-full bg-transparent hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              : 'h-8 w-11 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }`}
        aria-label={maximized ? t('common:window.restore') : t('common:window.maximize')}
      >
        {isMac ? (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              {maximized ? (
                <>
                  <path d="M1 5L5 1M5 1V4M5 1H2" stroke="#006500" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </>
              ) : (
                <>
                  <path d="M1 5L5 1M1 5V2M1 5H4" stroke="#006500" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </>
              )}
            </svg>
          </span>
        ) : maximized ? (
          <span className={`relative block ${isLinux ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5'}`}>
            <span className="absolute right-0 top-0 h-2 w-2 border border-current bg-transparent" />
            <span className="absolute bottom-0 left-0 h-2 w-2 border border-current bg-[hsl(var(--background))]" />
          </span>
        ) : (
          <span className={`block border border-current bg-transparent ${isLinux ? 'h-2.5 w-2.5' : 'h-2.5 w-2.5'}`} />
        )}
      </button>
      <button
        type="button"
        onClick={() => void handleClose()}
        className={`flex items-center justify-center transition-colors ${
          isMac
            ? 'order-1 h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-[#ff5f56]'
            : isLinux
              ? 'h-6 w-6 rounded-full bg-transparent hover:bg-[#e81123] text-[hsl(var(--muted-foreground))] hover:text-white'
              : 'h-8 w-11 hover:bg-[#e81123] text-[hsl(var(--muted-foreground))] hover:text-white'
        }`}
        aria-label={t('common:window.close')}
      >
        {isMac ? (
           <span className="opacity-0 group-hover:opacity-100 transition-opacity relative block h-2 w-2">
            <span className="absolute left-1/2 top-1/2 h-[1px] w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#4c0000]" />
            <span className="absolute left-1/2 top-1/2 h-[1px] w-2 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#4c0000]" />
          </span>
        ) : (
          <span className="relative block h-2.5 w-2.5">
            <span className="absolute left-1/2 top-0 h-2.5 w-[1.5px] -translate-x-1/2 rotate-45 bg-current" />
            <span className="absolute left-1/2 top-0 h-2.5 w-[1.5px] -translate-x-1/2 -rotate-45 bg-current" />
          </span>
        )}
      </button>
    </div>
  )

  return (
    <div
      className={`relative grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-y-1 px-3 py-2 text-[hsl(var(--foreground))] ${titleBarClassName} ${maximized ? 'px-1.5' : 'px-3'} ${isMac ? 'grid-cols-[1fr_auto_1fr]' : ''}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div aria-hidden="true" className="pointer-events-none justify-self-start" />
      <div className="pointer-events-none justify-self-center flex min-w-0 flex-col items-center text-center">
        <div className="truncate text-[15px] font-semibold leading-none tracking-tight">SoloForge · Team OS</div>
        <div className="mt-1 truncate text-[10px] leading-none uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          {t('navigation:app.desktopControlCenter')}
        </div>
        <div className={`mt-1 hidden items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.68)] bg-[hsl(var(--background)_/_0.5)] px-3 py-1.5 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] xl:flex ${isLinux ? 'opacity-95' : ''}`}>
          <span className="uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{titleContext.section}</span>
          <span className="text-[hsl(var(--muted-foreground))]">/</span>
          <span className="font-medium text-[hsl(var(--foreground))]">{titleContext.page}</span>
          {dynamicLabel && (
            <>
              <span className="text-[hsl(var(--muted-foreground))]">/</span>
              <span className="max-w-[18rem] truncate text-[hsl(var(--muted-foreground))]">{dynamicLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className={`pointer-events-auto justify-self-end flex items-center gap-2 pr-1 ${isMac ? 'mr-auto pr-0' : ''}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {titleAction && (
          <div className="hidden items-center gap-1 xl:flex">
            <button
              type="button"
              onClick={() => navigate(titleAction.backTo)}
              className="rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.48)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              {t('common:buttons.backToList')}
            </button>
            {titleAction.id && (
              <button
                type="button"
                onClick={() => void handleCopyId()}
                className="rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.48)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              >
                {copiedId ? t('common:buttons.idCopied') : t('common:buttons.copyId')}
              </button>
            )}
          </div>
        )}

        {controls}
      </div>
    </div>
  )
}
// Layout 组件属性
interface LayoutProps {
  children: React.ReactNode
}
// 主布局组件
export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <WindowTitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        {/* 侧边栏 - 移动端隐藏 */}
        <div className="hidden shrink-0 bg-[hsl(var(--background))] md:block md:p-3 md:pr-0">
          <Sidebar />
        </div>
        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:p-3 md:pl-4">
          {/* 顶部栏 - 固定在顶部 */}
          <div className="sticky top-0 z-10">
            <Topbar />
          </div>
          {/* 页面内容 - 响应式内边距 */}
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
