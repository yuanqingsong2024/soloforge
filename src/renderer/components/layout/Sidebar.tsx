import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { readLocalStorage, writeLocalStorage } from '../../lib/storage'

// 侧边栏导航项接口
interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
}

type DisplayMode = 'basic' | 'advanced' | 'expert'

interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

const displayModeRank: Record<DisplayMode, number> = {
  basic: 0,
  advanced: 1,
  expert: 2
}

function resolveInitialDisplayMode(): DisplayMode {
  const stored = readLocalStorage('soloforge-display-mode')
  return stored === 'advanced' || stored === 'expert' ? stored : 'basic'
}

// 侧边栏组件
export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslation(['navigation', 'common'])
  const [displayMode, setDisplayMode] = React.useState<DisplayMode>(resolveInitialDisplayMode)

  React.useEffect(() => {
    writeLocalStorage('soloforge-display-mode', displayMode)
  }, [displayMode])

  // 导航项配置
  const navItems: NavItem[] = [
    {
      path: '/',
      label: t('navigation:menu.dashboard'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      )
    },
    {
      path: '/tickets',
      label: t('navigation:menu.tickets'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" />
          <path d="M8 3H3v5" />
          <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
          <path d="m15 9 6-6" />
        </svg>
      )
    },
    {
      path: '/approvals',
      label: t('navigation:menu.approvals'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    },
    {
      path: '/audit',
      label: t('navigation:menu.audit'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      )
    },
    {
      path: '/team',
      label: t('navigation:menu.team'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      path: '/communications',
      label: t('navigation:menu.communications'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    },
    {
      path: '/contacts',
      label: t('navigation:menu.contacts'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      path: '/outbound-messages',
      label: t('navigation:menu.outboundMessages'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      )
    },
    {
      path: '/changes',
      label: t('navigation:menu.changes'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6" />
          <path d="m9 15 3 3 3-3" />
        </svg>
      )
    },
    {
      path: '/openclaw-config',
      label: t('navigation:menu.openclawConfig'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    },
    {
      path: '/deployments',
      label: t('navigation:menu.deployments'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 7h10" />
          <path d="M7 12h10" />
          <path d="M7 17h10" />
        </svg>
      )
    },
    {
      path: '/host-agents',
      label: t('navigation:menu.hostAgents'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6" />
          <path d="M9 15h6" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
        </svg>
      )
    },
    {
      path: '/agent-actions',
      label: t('navigation:menu.agentActions'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
          <path d="M5 5v14" />
        </svg>
      )
    },
    {
      path: '/health-monitoring',
      label: t('navigation:menu.healthMonitoring'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6" />
          <path d="M12 9v6" />
          <path d="M14 4.1 12 6l-2-1.9a2 2 0 0 0-2.8 0L4.1 7.2a2 2 0 0 0 0 2.8L6 12l-1.9 2a2 2 0 0 0 0 2.8l3.1 3.1a2 2 0 0 0 2.8 0L12 18l2 1.9a2 2 0 0 0 2.8 0l3.1-3.1a2 2 0 0 0 0-2.8L18 12l1.9-2a2 2 0 0 0 0-2.8l-3.1-3.1a2 2 0 0 0-2.8 0Z" />
        </svg>
      )
    },
    {
      path: '/activity-feed',
      label: t('navigation:menu.activityFeed'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      )
    },
    {
      path: '/operations',
      label: t('navigation:menu.operations'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="6" rx="1" />
          <rect x="3" y="14" width="18" height="6" rx="1" />
          <path d="M7 7h.01" />
          <path d="M7 17h.01" />
          <path d="M11 7h6" />
          <path d="M11 17h6" />
        </svg>
      )
    },
    {
      path: '/notification-policies',
      label: t('navigation:menu.notificationPolicies'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      )
    },
    {
      path: '/releases',
      label: t('navigation:menu.releases'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20" />
          <path d="m19 5-7-3-7 3" />
          <path d="m19 19-7 3-7-3" />
        </svg>
      )
    },
    {
      path: '/upgrade-plans',
      label: t('navigation:menu.upgradePlans'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h18v6H3z" />
          <path d="M3 15h18v6H3z" />
          <path d="m9 9 3 3 3-3" />
        </svg>
      )
    },
    {
      path: '/upgrade-runs',
      label: t('navigation:menu.upgradeRuns'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4" />
          <path d="m16.2 4.8-2.4 2.4" />
          <path d="M18 12h4" />
          <path d="m16.2 19.2-2.4-2.4" />
          <path d="M12 18v4" />
          <path d="m7.8 19.2 2.4-2.4" />
          <path d="M2 12h4" />
          <path d="m7.8 4.8 2.4 2.4" />
        </svg>
      )
    },
    {
      path: '/release-policies',
      label: t('navigation:menu.releasePolicies'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    },
    {
      path: '/maintenance-windows',
      label: t('navigation:menu.maintenanceWindows'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      )
    },
    {
      path: '/workspace-settings',
      label: t('navigation:menu.workspaceSettings'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    },
    {
      path: '/outbox',
      label: t('navigation:menu.outbox'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      )
    },
    {
      path: '/backup',
      label: t('navigation:menu.backup'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
      )
    },
    {
      path: '/connection',
      label: t('navigation:menu.connection'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )
    },
    {
      path: '/help',
      label: t('navigation:menu.help'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      )
    }
  ]

  // 判断是否为当前路由
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  const navItemByPath = new Map(navItems.map(item => [item.path, item]))
  const pickNavItems = (items: Array<string | { path: string; minMode: DisplayMode }>): NavItem[] => items
    .filter(item => typeof item === 'string' || displayModeRank[displayMode] >= displayModeRank[item.minMode])
    .map(item => navItemByPath.get(typeof item === 'string' ? item : item.path))
    .filter((item): item is NavItem => Boolean(item))

  const navGroups: NavGroup[] = [
    {
      key: 'dashboard',
      title: t('navigation:groups.dashboard'),
      items: pickNavItems(['/'])
    },
    {
      key: 'workspaces',
      title: t('navigation:groups.workspaces'),
      items: pickNavItems(['/workspace-settings', '/connection'])
    },
    {
      key: 'tickets',
      title: t('navigation:groups.tickets'),
      items: pickNavItems(['/tickets', '/communications', '/contacts', '/outbound-messages'])
    },
    {
      key: 'openclaw',
      title: t('navigation:groups.openclaw'),
      items: pickNavItems([
        '/openclaw-config',
        '/deployments',
        '/host-agents',
        '/releases',
        '/upgrade-plans',
        { path: '/agent-actions', minMode: 'expert' },
        { path: '/upgrade-runs', minMode: 'expert' }
      ])
    },
    {
      key: 'operations',
      title: t('navigation:groups.operations'),
      items: pickNavItems(['/operations', '/health-monitoring', '/activity-feed', '/backup', { path: '/outbox', minMode: 'expert' }])
    },
    {
      key: 'governance',
      title: t('navigation:groups.governance'),
      items: pickNavItems(['/approvals', '/changes', '/audit'])
    },
    {
      key: 'settings',
      title: t('navigation:groups.settings'),
      items: pickNavItems([
        '/team',
        { path: '/notification-policies', minMode: 'advanced' },
        { path: '/release-policies', minMode: 'advanced' },
        { path: '/maintenance-windows', minMode: 'advanced' },
        '/help'
      ])
    }
  ]

  const renderNavGroup = (items: NavItem[], title: string) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3">
        <div className="h-px flex-1 bg-[linear-gradient(90deg,hsl(var(--border)_/_0.2),transparent)]" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">{title}</div>
      </div>
      <ul className="space-y-1.5 rounded-workshop-lg border border-[hsl(var(--border)_/_0.42)] bg-[linear-gradient(180deg,hsl(var(--background)_/_0.22),hsl(var(--background)_/_0.12))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
        {items.map((item) => {
          const active = isActive(item.path)
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                data-testid={`sidebar-link-${item.path === '/' ? 'dashboard' : item.path.slice(1).replace(/\//g, '-')}`}
                className={`
                  group relative flex items-center gap-3 px-3.5 py-2.5 rounded-workshop-md
                  text-sm font-medium transition-all duration-200 cursor-pointer
                  ${
                    active
                      ? 'border border-[hsl(var(--google-blue)_/_0.18)] bg-[linear-gradient(135deg,hsl(var(--google-blue)_/_0.14),hsl(var(--google-green)_/_0.1))] text-[hsl(var(--foreground))] shadow-workshop-sm'
                      : 'border border-transparent text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border)_/_0.78)] hover:bg-[hsl(var(--accent)_/_0.72)] hover:text-[hsl(var(--accent-foreground))]'
                  }
                `}
              >
                {active && <span className="absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-[hsl(var(--google-blue))]" />}
                <span className={`shrink-0 ${active ? 'text-[hsl(var(--google-blue))]' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]'}`}>{item.icon}</span>
                <span className="truncate leading-5">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <aside data-testid="app-sidebar" className="flex h-[calc(100vh-1.5rem)] w-72 flex-col rounded-[28px] border border-[hsl(var(--border)_/_0.82)] bg-[linear-gradient(180deg,hsl(var(--card)_/_0.94),hsl(var(--card)_/_0.82))] shadow-workshop-md backdrop-blur supports-[backdrop-filter]:bg-[linear-gradient(180deg,hsl(var(--card)_/_0.9),hsl(var(--card)_/_0.78))]">
      {/* Logo 区域 */}
      <div className="flex min-h-24 items-center border-b border-[hsl(var(--border)_/_0.7)] px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-workshop-lg border border-[hsl(var(--border))] bg-[linear-gradient(135deg,hsl(var(--google-blue)_/_0.16),hsl(var(--google-green)_/_0.14))] shadow-workshop-sm">
            <span className="text-lg font-semibold tracking-tight text-[hsl(var(--foreground))]">SF</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">SoloForge</h1>
            <p className="mt-1 text-xs tracking-[0.16em] text-[hsl(var(--muted-foreground))] uppercase">Workshop OS</p>
          </div>
        </div>
      </div>

      {/* 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-gutter:stable]">
        <div className="space-y-5">
          <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.42)] bg-[hsl(var(--background)_/_0.34)] p-3 shadow-workshop-sm">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              {t('navigation:displayMode.label')}
            </label>
            <select
              value={displayMode}
              onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}
              className="mt-2 w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs text-[hsl(var(--foreground))]"
              aria-label={t('navigation:displayMode.label')}
            >
              <option value="basic">{t('navigation:displayMode.basic')}</option>
              <option value="advanced">{t('navigation:displayMode.advanced')}</option>
              <option value="expert">{t('navigation:displayMode.expert')}</option>
            </select>
            <p className="mt-2 text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">
              {t(`navigation:displayMode.${displayMode}Desc`)}
            </p>
          </div>
          {navGroups.map(group => (
            <React.Fragment key={group.key}>
              {renderNavGroup(group.items, group.title)}
            </React.Fragment>
          ))}
        </div>
      </nav>

      {/* 底部信息 */}
      <div className="border-t border-[hsl(var(--border)_/_0.7)] p-4">
        <div className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.78)] bg-[hsl(var(--background)_/_0.52)] px-3 py-2.5 text-center shadow-workshop-sm">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">SoloForge v1.0.0</p>
        </div>
      </div>
    </aside>
  )
}
