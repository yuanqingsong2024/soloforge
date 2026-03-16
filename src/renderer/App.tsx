import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { TicketBoard } from './pages/TicketBoard'
import { TicketDetail } from './pages/TicketDetail'
import { TeamManagement } from './pages/TeamManagement'
import { ApprovalCenter } from './pages/ApprovalCenter'
import { AuditLogs } from './pages/AuditLogs'
import { ConnectionSettings } from './pages/ConnectionSettings'
import { ConfigCenter } from './pages/ConfigCenter'
import { Communications } from './pages/Communications'
import { OutboundMessageCenter } from './pages/OutboundMessageCenter'
import { Contacts } from './pages/Contacts'
import { OutboxManagement } from './pages/OutboxManagement'
import { BackupRestore } from './pages/BackupRestore'
import { Changes } from './pages/Changes'
import { WorkspaceSettings } from './pages/WorkspaceSettings'
import { Deployments } from './pages/Deployments'
import { DeploymentDetail } from './pages/DeploymentDetail'
import { DeploymentWizard } from './pages/DeploymentWizard'
import { DoctorPage } from './pages/DoctorPage'
import { ActivityFeed } from './pages/ActivityFeed'
import { OperationsPage } from './pages/OperationsPage'
import { AlertsPage } from './pages/AlertsPage'
import { NotificationPoliciesPage } from './pages/NotificationPoliciesPage'
import { DoctorSchedulerPage } from './pages/DoctorSchedulerPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { UpgradePlansPage } from './pages/UpgradePlansPage'
import { UpgradeRunsPage } from './pages/UpgradeRunsPage'
import { ReleasePoliciesPage } from './pages/ReleasePoliciesPage'
import { MaintenanceWindowsPage } from './pages/MaintenanceWindowsPage'
import { HostAgentsPage } from './pages/HostAgentsPage'
import { HostAgentDetailPage } from './pages/HostAgentDetailPage'
import { HostAgentBootstrapWizardPage } from './pages/HostAgentBootstrapWizardPage'
import { AgentActionsPage } from './pages/AgentActionsPage'

function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
          <Route path="/doctor" element={<DoctorPage />} />
          <Route path="/activity-feed" element={<ActivityFeed />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/notification-policies" element={<NotificationPoliciesPage />} />
          <Route path="/doctor-scheduler" element={<DoctorSchedulerPage />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/upgrade-plans" element={<UpgradePlansPage />} />
          <Route path="/upgrade-runs" element={<UpgradeRunsPage />} />
          <Route path="/release-policies" element={<ReleasePoliciesPage />} />
          <Route path="/maintenance-windows" element={<MaintenanceWindowsPage />} />
          <Route path="/host-agents" element={<HostAgentsPage />} />
          <Route path="/host-agents/new" element={<HostAgentBootstrapWizardPage />} />
          <Route path="/host-agents/:id" element={<HostAgentDetailPage />} />
          <Route path="/agent-actions" element={<AgentActionsPage />} />
          <Route path="/workspace-settings" element={<WorkspaceSettings />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/deployments/new" element={<DeploymentWizard />} />
          <Route path="/deployments/:id" element={<DeploymentDetail />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}

export default App
