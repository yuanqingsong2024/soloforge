import './lib/i18n'

import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { PluginProvider } from './components/plugin'
import { KeyboardShortcutsHelp, useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { LoadingState } from './components/ui/LoadingState'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })))
const TicketBoard = lazy(() => import('./pages/TicketBoard').then((module) => ({ default: module.TicketBoard })))
const TicketDetail = lazy(() => import('./pages/TicketDetail').then((module) => ({ default: module.TicketDetail })))
const TeamManagement = lazy(() => import('./pages/TeamManagement').then((module) => ({ default: module.TeamManagement })))
const ApprovalCenter = lazy(() => import('./pages/ApprovalCenter').then((module) => ({ default: module.ApprovalCenter })))
const AuditLogs = lazy(() => import('./pages/AuditLogs').then((module) => ({ default: module.AuditLogs })))
const ConnectionSettings = lazy(() => import('./pages/ConnectionSettings').then((module) => ({ default: module.ConnectionSettings })))
const ConfigCenter = lazy(() => import('./pages/ConfigCenter').then((module) => ({ default: module.ConfigCenter })))
const Communications = lazy(() => import('./pages/Communications').then((module) => ({ default: module.Communications })))
const OutboundMessageCenter = lazy(() => import('./pages/OutboundMessageCenter').then((module) => ({ default: module.OutboundMessageCenter })))
const Contacts = lazy(() => import('./pages/Contacts').then((module) => ({ default: module.Contacts })))
const OutboxManagement = lazy(() => import('./pages/OutboxManagement').then((module) => ({ default: module.OutboxManagement })))
const BackupRestore = lazy(() => import('./pages/BackupRestore').then((module) => ({ default: module.BackupRestore })))
const Changes = lazy(() => import('./pages/Changes').then((module) => ({ default: module.Changes })))
const ChangeRequestDetail = lazy(() => import('./pages/ChangeRequestDetail').then((module) => ({ default: module.ChangeRequestDetail })))
const WorkspaceSettings = lazy(() => import('./pages/WorkspaceSettings').then((module) => ({ default: module.WorkspaceSettings })))
const Deployments = lazy(() => import('./pages/Deployments').then((module) => ({ default: module.Deployments })))
const DeploymentDetail = lazy(() => import('./pages/DeploymentDetail').then((module) => ({ default: module.DeploymentDetail })))
const DeploymentJobDetail = lazy(() => import('./pages/DeploymentJobDetail').then((module) => ({ default: module.DeploymentJobDetail })))
const DeploymentWizard = lazy(() => import('./pages/DeploymentWizard').then((module) => ({ default: module.DeploymentWizard })))
const HealthMonitoringPage = lazy(() => import('./pages/HealthMonitoringPage').then((module) => ({ default: module.HealthMonitoringPage })))
const ActivityFeed = lazy(() => import('./pages/ActivityFeed').then((module) => ({ default: module.ActivityFeed })))
const InvestigationTimelinePage = lazy(() => import('./pages/InvestigationTimelinePage').then((module) => ({ default: module.InvestigationTimelinePage })))
const TraceDetailPage = lazy(() => import('./pages/TraceDetailPage').then((module) => ({ default: module.TraceDetailPage })))
const OperationsPage = lazy(() => import('./pages/OperationsPage').then((module) => ({ default: module.OperationsPage })))
const OperationDetail = lazy(() => import('./pages/OperationDetail').then((module) => ({ default: module.OperationDetail })))
const NotificationPoliciesPage = lazy(() => import('./pages/NotificationPoliciesPage').then((module) => ({ default: module.NotificationPoliciesPage })))
const ReleasesPage = lazy(() => import('./pages/ReleasesPage').then((module) => ({ default: module.ReleasesPage })))
const UpgradePlansPage = lazy(() => import('./pages/UpgradePlansPage').then((module) => ({ default: module.UpgradePlansPage })))
const UpgradeRunsPage = lazy(() => import('./pages/UpgradeRunsPage').then((module) => ({ default: module.UpgradeRunsPage })))
const ReleasePoliciesPage = lazy(() => import('./pages/ReleasePoliciesPage').then((module) => ({ default: module.ReleasePoliciesPage })))
const MaintenanceWindowsPage = lazy(() => import('./pages/MaintenanceWindowsPage').then((module) => ({ default: module.MaintenanceWindowsPage })))
const HostAgentsPage = lazy(() => import('./pages/HostAgentsPage').then((module) => ({ default: module.HostAgentsPage })))
const HostAgentDetailPage = lazy(() => import('./pages/HostAgentDetailPage').then((module) => ({ default: module.HostAgentDetailPage })))
const HostAgentBootstrapWizardPage = lazy(() => import('./pages/HostAgentBootstrapWizardPage').then((module) => ({ default: module.HostAgentBootstrapWizardPage })))
const AgentActionsPage = lazy(() => import('./pages/AgentActionsPage').then((module) => ({ default: module.AgentActionsPage })))
const AgentActionDetail = lazy(() => import('./pages/AgentActionDetail').then((module) => ({ default: module.AgentActionDetail })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((module) => ({ default: module.HelpPage })))
const AutoSetupWizard = lazy(() => import('./pages/AutoSetupWizard').then((module) => ({ default: module.AutoSetupWizard })))
const SetupWizard = lazy(() => import('./pages/SetupWizard').then((module) => ({ default: module.SetupWizard })))
const DoctorPage = lazy(() => import('./pages/DoctorPage').then((module) => ({ default: module.DoctorPage })))
const HermesWorkers = lazy(() => import('./pages/HermesWorkers').then((module) => ({ default: module.default })))
const PluginManagementPage = lazy(() => import('./pages/PluginManagementPage').then((module) => ({ default: module.PluginManagementPage })))

// 预加载映射
const prefetchMap: Record<string, () => Promise<unknown>> = {
  '/': () => import('./pages/Dashboard'),
  '/tickets': () => import('./pages/TicketBoard'),
  '/team': () => import('./pages/TeamManagement'),
  '/approvals': () => import('./pages/ApprovalCenter'),
  '/audit': () => import('./pages/AuditLogs'),
}

// 预加载 Hook
function useRoutePrefetch() {
  useEffect(() => {
    // 空闲时预加载常用页面
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback!(() => {
        Object.values(prefetchMap).forEach(preload => preload())
      })
    }
  }, [])
}

function App() {
  // 启用全局键盘快捷键
  const { showHelp, setShowHelp } = useKeyboardShortcuts({ enabled: true })
  // 预加载常用页面
  useRoutePrefetch()

  return (
    <ThemeProvider>
      <LanguageProvider>
        <PluginProvider>
          <HashRouter>
          <Layout>
            <ErrorBoundary>
              <Suspense fallback={<LoadingState message="加载中..." fullPage className="min-h-screen" />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                <Route path="/auto-setup" element={<AutoSetupWizard />} />
                <Route path="/setup/wizard" element={<SetupWizard />} />
                <Route path="/tickets" element={<TicketBoard />} />
                <Route path="/tickets/:id" element={<TicketDetail />} />
                <Route path="/team" element={<TeamManagement />} />
                <Route path="/approvals" element={<ApprovalCenter />} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="/connection" element={<ConnectionSettings />} />
                <Route path="/openclaw-config" element={<ConfigCenter />} />
                <Route path="/communications" element={<Communications />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/outbound-messages" element={<OutboundMessageCenter />} />
                <Route path="/outbox" element={<OutboxManagement />} />
                <Route path="/backup" element={<BackupRestore />} />
                <Route path="/changes" element={<Changes />} />
                <Route path="/changes/:id" element={<ChangeRequestDetail />} />
                <Route path="/health-monitoring" element={<HealthMonitoringPage />} />
                <Route path="/activity-feed" element={<ActivityFeed />} />
                <Route path="/investigation-timeline" element={<InvestigationTimelinePage />} />
                <Route path="/traces/:traceId" element={<TraceDetailPage />} />
                <Route path="/operations" element={<OperationsPage />} />
                <Route path="/operations/:id" element={<OperationDetail />} />
                <Route path="/notification-policies" element={<NotificationPoliciesPage />} />
                <Route path="/releases" element={<ReleasesPage />} />
                <Route path="/upgrade-plans" element={<UpgradePlansPage />} />
                <Route path="/upgrade-runs" element={<UpgradeRunsPage />} />
                <Route path="/release-policies" element={<ReleasePoliciesPage />} />
                <Route path="/maintenance-windows" element={<MaintenanceWindowsPage />} />
                <Route path="/host-agents" element={<HostAgentsPage />} />
                <Route path="/host-agents/new" element={<HostAgentBootstrapWizardPage />} />
                <Route path="/host-agents/:id" element={<HostAgentDetailPage />} />
                <Route path="/agent-actions" element={<AgentActionsPage />} />
                <Route path="/agent-actions/:id" element={<AgentActionDetail />} />
                <Route path="/workspace-settings" element={<WorkspaceSettings />} />
                <Route path="/deployments" element={<Deployments />} />
                <Route path="/deployments/new" element={<DeploymentWizard />} />
                <Route path="/deployments/:id" element={<DeploymentDetail />} />
                <Route path="/deployment-jobs/:id" element={<DeploymentJobDetail />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/doctor" element={<DoctorPage />} />
                <Route path="/hermes-workers" element={<HermesWorkers />} />
                <Route path="/plugins" element={<PluginManagementPage />} />
              </Routes>
              </Suspense>
            </ErrorBoundary>
          </Layout>
          {/* 全局快捷键帮助弹窗 */}
          <KeyboardShortcutsHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
        </HashRouter>
        </PluginProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
