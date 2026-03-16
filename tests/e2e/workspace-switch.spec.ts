import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, switchWorkspace, waitForDashboardReady } from './helpers/electron'

test('切换 Workspace 后 Dashboard 上下文更新且不空白', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo)

  try {
    await waitForDashboardReady(context.page)
    await expect(context.page.getByTestId('dashboard-critical-issues')).toContainText('Local')

    await switchWorkspace(context.page, '00000000-0000-0000-0000-000000000002')

    await expect(context.page.getByTestId('dashboard-overview-card-alerts')).toContainText('1')
    await expect(context.page.getByTestId('dashboard-critical-issues')).toContainText('Remote Workspace')
    await expect(context.page.getByTestId('dashboard-pending-actions')).toContainText('Remote Workspace 审批项')
    await expect(context.page.getByTestId('dashboard-page')).toBeVisible()
  } finally {
    await closeElectronApp(context)
  }
})
