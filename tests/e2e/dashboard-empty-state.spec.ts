import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test('空状态场景展示局部 empty state 而不是整页报错', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo, 'empty-state')

  try {
    await waitForDashboardReady(context.page)
    await expect(context.page.getByTestId('dashboard-critical-issues-empty')).toBeVisible()
    await expect(context.page.getByTestId('dashboard-pending-actions-empty')).toBeVisible()
    await expect(context.page.getByTestId('dashboard-error-banner')).toHaveCount(0)
  } finally {
    await closeElectronApp(context)
  }
})
