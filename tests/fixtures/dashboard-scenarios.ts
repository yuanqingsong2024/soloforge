export type DashboardScenarioId = 'default' | 'workspace-secondary' | 'empty-state'

export const dashboardScenarios: Record<DashboardScenarioId, { label: string }> = {
  default: { label: '默认 Dashboard 场景' },
  'workspace-secondary': { label: 'Secondary Workspace Dashboard 场景' },
  'empty-state': { label: '空状态 Dashboard 场景' }
}
