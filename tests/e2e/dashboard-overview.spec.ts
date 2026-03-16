import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test('Dashboard 总览区与关键区块正常渲染', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo)

  try {
    await waitForDashboardReady(context.page)
    await expect(context.page.getByTestId('dashboard-overview-card-workspaces')).toContainText('2')
    await expect(context.page.getByTestId('dashboard-overview-card-alerts')).toContainText('3')
    await expect(context.page.getByTestId('dashboard-critical-issues')).toContainText('Host Agent 已离线')
    await expect(context.page.getByTestId('dashboard-pending-actions')).toContainText('待审批配置变更')
    await expect(context.page.getByTestId('dashboard-activity-feed-preview')).toContainText('目标不可达')
  } finally {
    await closeElectronApp(context)
  }
})
