import React, { useState, useCallback, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { readLocalStorage, writeLocalStorage } from '../../lib/storage'

// ============================================
// 类型定义
// ============================================

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
  badge?: string | number
}

interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

type DisplayMode = 'basic' | 'advanced' | 'expert'

// ============================================
// 图标组件
// ============================================

const Icons = {
  dashboard: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  ),
  tickets: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
      <path d="m15 9 6-6" />
    </svg>
  ),
  approvals: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  audit: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  ),
  team: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  communications: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  contacts: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  ),
  outbound: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  ),
  changes: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="m9 15 3 3 3-3" />
    </svg>
  ),
  config: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  deployments: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
    </svg>
  ),
  agents: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6" />
      <path d="M9 15h6" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
    </svg>
  ),
  actions: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
      <path d="M5 5v14" />
    </svg>
  ),
  health: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12h6" />
      <path d="M12 9v6" />
      <path d="M14 4.1 12 6l-2-1.9a2 2 0 0 0-2.8 0L4.1 7.2a2 2 0 0 0 0 2.8L6 12l-1.9 2a2 2 0 0 0 0 2.8l3.1 3.1a2 2 0 0 0 2.8 0L12 18l2 1.9a2 2 0 0 0 2.8 0l3.1-3.1a2 2 0 0 0 0-2.8L18 12l1.9-2a2 2 0 0 0 0-2.8l-3.1-3.1a2 2 0 0 0-2.8 0Z" />
    </svg>
  ),
  activity: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  operations: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <path d="M7 7h.01" />
      <path d="M7 17h.01" />
      <path d="M11 7h6" />
      <path d="M11 17h6" />
    </svg>
  ),
  notifications: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  releases: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20" />
      <path d="m19 5-7-3-7 3" />
      <path d="m19 19-7 3-7-3" />
    </svg>
  ),
  upgrades: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v6H3z" />
      <path d="M3 15h18v6H3z" />
      <path d="m9 9 3 3 3-3" />
    </svg>
  ),
  runs: (
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
  ),
  policies: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  maintenance: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  outbox: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  backup: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  connection: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  help: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  ),
  hermes: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  chevronDown: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  collapse: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  expand: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  doctor: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  plugins: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  ),
  autoSetup: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="m6.34 7.34 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="m6.34 16.66 2.83-2.83" />
      <path d="M12 18v4" />
      <path d="m17.66 16.66-2.83-2.83" />
      <path d="M18 12h4" />
      <path d="m17.66 7.34-2.83 2.83" />
    </svg>
  ),
}

// ============================================
// 主组件
// ============================================

const displayModeRank: Record<DisplayMode, number> = {
  basic: 0,
  advanced: 1,
  expert: 2
}

function resolveInitialDisplayMode(): DisplayMode {
  const stored = readLocalStorage('soloforge-display-mode')
  return stored === 'advanced' || stored === 'expert' ? stored : 'basic'
}

export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslation(['navigation', 'common'])
  const [displayMode, setDisplayMode] = useState<DisplayMode>(resolveInitialDisplayMode)
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['dashboard', 'workspaces', 'tickets', 'claude-code', 'governance', 'settings']))

  React.useEffect(() => {
    writeLocalStorage('soloforge-display-mode', displayMode)
  }, [displayMode])

  // 使用 useMemo 缓存导航项配置，避免每次渲染重新创建
  const navItems: NavItem[] = useMemo(() => [
    { path: '/', label: t('navigation:menu.dashboard'), icon: Icons.dashboard },
    { path: '/tickets', label: t('navigation:menu.tickets'), icon: Icons.tickets },
    { path: '/approvals', label: t('navigation:menu.approvals'), icon: Icons.approvals },
    { path: '/audit', label: t('navigation:menu.audit'), icon: Icons.audit },
    { path: '/team', label: t('navigation:menu.team'), icon: Icons.team },
    { path: '/communications', label: t('navigation:menu.communications'), icon: Icons.communications },
    { path: '/contacts', label: t('navigation:menu.contacts'), icon: Icons.contacts },
    { path: '/outbound-messages', label: t('navigation:menu.outboundMessages'), icon: Icons.outbound },
    { path: '/changes', label: t('navigation:menu.changes'), icon: Icons.changes },
    { path: '/openclaw-config', label: t('navigation:menu.claude-codeConfig'), icon: Icons.config },
    { path: '/deployments', label: t('navigation:menu.deployments'), icon: Icons.deployments },
    { path: '/host-agents', label: t('navigation:menu.hostAgents'), icon: Icons.agents },
    { path: '/agent-actions', label: t('navigation:menu.agentActions'), icon: Icons.actions },
    { path: '/health-monitoring', label: t('navigation:menu.healthMonitoring'), icon: Icons.health },
    { path: '/doctor', label: t('navigation:menu.doctor'), icon: Icons.doctor },
    { path: '/activity-feed', label: t('navigation:menu.activityFeed'), icon: Icons.activity },
    { path: '/operations', label: t('navigation:menu.operations'), icon: Icons.operations },
    { path: '/notification-policies', label: t('navigation:menu.notificationPolicies'), icon: Icons.notifications },
    { path: '/releases', label: t('navigation:menu.releases'), icon: Icons.releases },
    { path: '/upgrade-plans', label: t('navigation:menu.upgradePlans'), icon: Icons.upgrades },
    { path: '/upgrade-runs', label: t('navigation:menu.upgradeRuns'), icon: Icons.runs },
    { path: '/release-policies', label: t('navigation:menu.releasePolicies'), icon: Icons.policies },
    { path: '/maintenance-windows', label: t('navigation:menu.maintenanceWindows'), icon: Icons.maintenance },
    { path: '/workspace-settings', label: t('navigation:menu.workspaceSettings'), icon: Icons.settings },
    { path: '/outbox', label: t('navigation:menu.outbox'), icon: Icons.outbox },
    { path: '/backup', label: t('navigation:menu.backup'), icon: Icons.backup },
    { path: '/connection', label: t('navigation:menu.connection'), icon: Icons.connection },
    { path: '/hermes-workers', label: t('navigation:menu.hermesWorkers'), icon: Icons.hermes },
    { path: '/plugins', label: t('navigation:menu.plugins'), icon: Icons.plugins },
    { path: '/auto-setup', label: t('navigation:menu.autoSetup'), icon: Icons.autoSetup },
    { path: '/help', label: t('navigation:menu.help'), icon: Icons.help },
  ], [t])

  const isActive = useCallback((path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }, [location.pathname])

  // 使用 useMemo 缓存 navItemByPath Map
  const navItemByPath = useMemo(() => new Map(navItems.map(item => [item.path, item])), [navItems])
  
  // 辅助函数提取为 useCallback
  const pickNavItems = useCallback((items: Array<string | { path: string; minMode: DisplayMode }>): NavItem[] => 
    items
      .filter(item => typeof item === 'string' || displayModeRank[displayMode] >= displayModeRank[item.minMode])
      .map(item => navItemByPath.get(typeof item === 'string' ? item : item.path))
      .filter((item): item is NavItem => Boolean(item))
  , [displayMode, navItemByPath])

  // 使用 useMemo 缓存导航分组
  const navGroups: NavGroup[] = useMemo(() => [
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
      key: 'claude-code',
      title: t('navigation:groups.claude-code'),
      items: pickNavItems([
        '/openclaw-config',
        '/deployments',
        '/host-agents',
        '/releases',
        '/upgrade-plans',
        '/hermes-workers',
        { path: '/agent-actions', minMode: 'expert' },
        { path: '/upgrade-runs', minMode: 'expert' }
      ])
    },
    {
      key: 'operations',
      title: t('navigation:groups.operations'),
      items: pickNavItems(['/operations', '/health-monitoring', '/doctor', '/activity-feed', '/backup', { path: '/outbox', minMode: 'expert' }])
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
        { path: '/plugins', minMode: 'expert' },
        { path: '/auto-setup', minMode: 'expert' },
        '/help'
      ])
    }
  ], [t, pickNavItems])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // 渲染单个导航项
  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path)
    
    if (collapsed) {
      return (
        <Link
          key={item.path}
          to={item.path}
          data-testid={`sidebar-link-${item.path === '/' ? 'dashboard' : item.path.slice(1).replace(/\//g, '-')}`}
          className={`
            group relative flex items-center justify-center
            h-11 w-11 rounded-xl
            transition-all duration-200
            ${active
              ? 'bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] shadow-[inset_0_1px_0_hsl(var(--primary)/0.1)]'
              : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
            }
          `}
          title={item.label}
        >
          {item.icon}
          {active && (
            <>
              <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--google-green))]" />
              <span className="absolute inset-0 rounded-xl ring-2 ring-[hsl(var(--primary)/0.2)]" />
            </>
          )}
        </Link>
      )
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        data-testid={`sidebar-link-${item.path === '/' ? 'dashboard' : item.path.slice(1).replace(/\//g, '-')}`}
        className={`
          group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
          text-sm font-medium transition-all duration-200
          ${active
            ? 'bg-gradient-to-r from-[hsl(var(--primary)/0.12)] to-[hsl(var(--primary)/0.04)] text-[hsl(var(--primary))] shadow-[inset_0_1px_0_hsl(var(--primary)/0.08)]'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
          }
        `}
      >
        {active && (
          <>
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--google-green))]" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-[hsl(var(--primary)/0.15)]" />
          </>
        )}
        <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
        <span className="truncate">{item.label}</span>
        {item.badge && (
          <span className="ml-auto rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.8)] px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
            {item.badge}
          </span>
        )}
      </Link>
    )
  }

  // 渲染导航分组
  const renderNavGroup = (group: NavGroup) => {
    const isExpanded = expandedGroups.has(group.key)

    if (collapsed) {
      return (
        <div key={group.key} className="space-y-1.5">
          {group.items.map(renderNavItem)}
        </div>
      )
    }

    return (
      <div key={group.key} className="space-y-1.5">
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground)/0.7)] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-gradient-to-r from-[hsl(var(--primary)/0.4)] to-transparent" />
            {group.title}
          </span>
          <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            {Icons.chevronDown}
          </span>
        </button>
        <div className={`space-y-0.5 overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
          {group.items.map(renderNavItem)}
        </div>
      </div>
    )
  }

  return (
    <aside
      data-testid="app-sidebar"
      className={`
        flex flex-col rounded-2xl border border-[hsl(var(--border)/0.6)]
        bg-[hsl(var(--card))]/95 backdrop-blur-xl
        transition-all duration-300 ease-out
        shadow-[var(--shadow-soft)]
        ${collapsed ? 'w-16' : 'w-64'}
      `}
      style={{ height: 'calc(100vh - 1.5rem)' }}
    >
      {/* Logo 区域 - 带渐变光晕 */}
      <div className={`
        relative flex items-center border-b border-[hsl(var(--border)/0.5)]
        transition-all duration-300 overflow-hidden
        ${collapsed ? 'justify-center px-2 py-5' : 'px-4 py-5'}
      `}>
        {/* 背景光晕装饰 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--google-blue)/0.08)] to-[hsl(var(--google-green)/0.04)]" />
        
        {collapsed ? (
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--google-blue))] to-[hsl(var(--google-green))] shadow-lg shadow-[hsl(var(--google-blue))/25]">
            <span className="text-sm font-bold text-white">SF</span>
          </div>
        ) : (
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--google-blue))] to-[hsl(var(--google-green))] shadow-lg shadow-[hsl(var(--google-blue))/25]">
              <span className="text-sm font-bold text-white">SF</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-[hsl(var(--foreground))] to-[hsl(var(--foreground)/0.8)] bg-clip-text text-transparent">SoloForge</h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Workshop OS</p>
            </div>
          </div>
        )}
      </div>

      {/* 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-5">
          {/* 显示模式切换 */}
          {!collapsed && (
            <div className="rounded-xl border border-[hsl(var(--border)/0.5)] bg-gradient-to-br from-[hsl(var(--muted))]/60 to-[hsl(var(--muted))]/30 p-3 shadow-[var(--shadow-sm)]">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
                {t('navigation:displayMode.label')}
              </label>
              <select
                value={displayMode}
                onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}
                className="mt-2 w-full rounded-lg border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--background))]/80 px-3 py-2 text-xs backdrop-blur-sm focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.15)] transition-all"
              >
                <option value="basic">{t('navigation:displayMode.basic')}</option>
                <option value="advanced">{t('navigation:displayMode.advanced')}</option>
                <option value="expert">{t('navigation:displayMode.expert')}</option>
              </select>
            </div>
          )}

          {/* 导航分组 */}
          {navGroups.map(renderNavGroup)}
        </div>
      </nav>

      {/* 底部区域 */}
      <div className="border-t border-[hsl(var(--border)/0.5)] p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/help"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-all duration-200"
              title="帮助"
            >
              {Icons.help}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-all duration-200"
              title="展开侧边栏"
            >
              {Icons.expand}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border)/0.5)] bg-gradient-to-br from-[hsl(var(--muted))]/60 to-[hsl(var(--muted))]/30 px-3 py-2.5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse-status" />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">v1.0.0</span>
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                <span>收起</span>
                {Icons.collapse}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
