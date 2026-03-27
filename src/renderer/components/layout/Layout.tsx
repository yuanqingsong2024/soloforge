import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

function getTitleContext(pathname: string): { section: string; page: string } {
  if (pathname === '/') return { section: '工作台', page: '仪表盘' }
  if (pathname.startsWith('/tickets/')) return { section: '工单', page: '工单详情' }
  if (pathname.startsWith('/tickets')) return { section: '工单', page: '工单看板' }
  if (pathname.startsWith('/team')) return { section: '组织', page: '团队管理' }
  if (pathname.startsWith('/approvals')) return { section: '审批', page: '审批中心' }
  if (pathname.startsWith('/audit')) return { section: '审计', page: '审计日志' }
  if (pathname.startsWith('/connection')) return { section: '连接', page: '连接配置' }
  if (pathname.startsWith('/openclaw-config')) return { section: '连接', page: 'OpenClaw 配置中心' }
  if (pathname.startsWith('/communications')) return { section: '通讯', page: '通讯设置' }
  if (pathname.startsWith('/contacts')) return { section: '通讯', page: '联系人' }
  if (pathname.startsWith('/outbound-messages')) return { section: '通讯', page: '外发消息中心' }
  if (pathname.startsWith('/outbox')) return { section: '通讯', page: 'Outbox' }
  if (pathname.startsWith('/backup')) return { section: '数据', page: '备份与恢复' }
  if (pathname.startsWith('/changes/')) return { section: '变更', page: '变更单详情' }
  if (pathname.startsWith('/changes')) return { section: '变更', page: '变更单' }
  if (pathname.startsWith('/doctor')) return { section: '巡检', page: 'Doctor' }
  if (pathname.startsWith('/activity-feed')) return { section: '运行态', page: 'Activity Feed' }
  if (pathname.startsWith('/operations')) return { section: '运行态', page: 'Operations' }
  if (pathname.startsWith('/alerts')) return { section: '运行态', page: 'Alerts' }
  if (pathname.startsWith('/notification-policies')) return { section: '运行态', page: '通知策略' }
  if (pathname.startsWith('/doctor-scheduler')) return { section: '运行态', page: 'Doctor 调度器' }
  if (pathname.startsWith('/releases')) return { section: '发布', page: 'Releases' }
  if (pathname.startsWith('/upgrade-plans')) return { section: '发布', page: '升级计划' }
  if (pathname.startsWith('/upgrade-runs')) return { section: '发布', page: '升级执行' }
  if (pathname.startsWith('/release-policies')) return { section: '发布', page: '发布策略' }
  if (pathname.startsWith('/maintenance-windows')) return { section: '发布', page: '维护窗口' }
  if (pathname.startsWith('/host-agents/new')) return { section: '宿主机', page: 'Bootstrap 向导' }
  if (pathname.startsWith('/host-agents/')) return { section: '宿主机', page: 'Agent 详情' }
  if (pathname.startsWith('/host-agents')) return { section: '宿主机', page: 'Host Agents' }
  if (pathname.startsWith('/agent-actions')) return { section: '宿主机', page: 'Agent Actions' }
  if (pathname.startsWith('/workspace-settings')) return { section: '工作区', page: 'Workspace 设置' }
  if (pathname.startsWith('/deployments/new')) return { section: '部署', page: '部署向导' }
  if (pathname.startsWith('/deployments/')) return { section: '部署', page: '部署详情' }
  if (pathname.startsWith('/deployments')) return { section: '部署', page: '部署管理' }
  return { section: '工作台', page: '控制中心' }
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
  const [maximized, setMaximized] = React.useState(false)
  const [platform, setPlatform] = React.useState<NodeJS.Platform>('win32')
  const location = useLocation()
  const navigate = useNavigate()
  const titleContext = React.useMemo(() => getTitleContext(location.pathname), [location.pathname])
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

  const handleToggleMaximize = async () => {
    if (typeof window.electronAPI?.toggleMaximizeWindow !== 'function') {
      return
    }
    const next = await window.electronAPI.toggleMaximizeWindow()
    setMaximized(next)
  }

  const handleCopyId = async () => {
    if (!titleAction?.id) return
    await navigator.clipboard.writeText(titleAction.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 1500)
  }

  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'

  const controls = (
    <div className={`flex items-center ${isMac ? 'gap-2 group' : isLinux ? 'gap-2' : ''}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => void window.electronAPI?.minimizeWindow?.()}
        className={`flex items-center justify-center transition-colors ${
          isMac
            ? 'order-2 h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#e1a325] hover:bg-[#ffbd2e]'
            : isLinux
              ? 'h-6 w-6 rounded-full bg-transparent hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              : 'h-8 w-11 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }`}
        aria-label="最小化窗口"
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
        aria-label={maximized ? '还原窗口' : '最大化窗口'}
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
        onClick={() => void window.electronAPI?.closeWindow?.()}
        className={`flex items-center justify-center transition-colors ${
          isMac
            ? 'order-1 h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-[#ff5f56]'
            : isLinux
              ? 'h-6 w-6 rounded-full bg-transparent hover:bg-[#e81123] text-[hsl(var(--muted-foreground))] hover:text-white'
              : 'h-8 w-11 hover:bg-[#e81123] text-[hsl(var(--muted-foreground))] hover:text-white'
        }`}
        aria-label="关闭窗口"
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
      className={`flex h-11 items-center justify-between border-b border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,#0d1626,#111827)] text-[hsl(var(--foreground))] ${maximized ? 'px-1.5' : 'px-3'} ${isMac ? 'flex-row-reverse' : ''}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className={`flex min-w-0 items-center gap-3 ${isMac ? 'ml-auto mr-3' : ''}`}>
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[radial-gradient(circle_at_top,hsl(var(--card)),hsl(var(--background)_/_0.74))] text-xs font-semibold text-[hsl(var(--foreground))] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
          SF
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">SoloForge · Team OS</div>
          <div className="truncate text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Desktop Control Center</div>
        </div>
      </div>

      <div className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 xl:flex items-center gap-2 rounded-full border border-[hsl(var(--border)_/_0.68)] bg-[hsl(var(--background)_/_0.5)] px-3 py-1.5 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${isLinux ? 'opacity-95' : ''} left-1/2 -translate-x-1/2`}>
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

      <div className={`flex items-center gap-2 ${isMac ? 'mr-auto' : ''}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {titleAction && (
          <div className="hidden items-center gap-1 xl:flex">
            <button
              type="button"
              onClick={() => navigate(titleAction.backTo)}
              className="rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.48)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              返回列表
            </button>
            {titleAction.id && (
              <button
                type="button"
                onClick={() => void handleCopyId()}
                className="rounded-full border border-[hsl(var(--border)_/_0.72)] bg-[hsl(var(--background)_/_0.48)] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              >
                {copiedId ? '已复制 ID' : '复制 ID'}
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
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <WindowTitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        {/* 侧边栏 - 移动端隐藏 */}
        <div className="hidden shrink-0 bg-[hsl(var(--background))] md:block md:p-3 md:pr-0">
          <Sidebar />
        </div>
        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:p-3 md:pl-4">
          {/* 顶部栏 */}
          <Topbar />
          {/* 页面内容 - 响应式内边距 */}
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
