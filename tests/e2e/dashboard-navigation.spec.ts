import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, openDashboard, waitForDashboardReady } from './helpers/electron'

test('Dashboard 卡片与关键项可跳转并返回', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo)

  try {
    await waitForDashboardReady(context.page)

    await context.page.getByTestId('dashboard-overview-card-alerts').click()
    await expect(context.page).toHaveURL(/#\/alerts/)

    await openDashboard(context.page)
    await context.page.getByTestId('dashboard-critical-action-issue-alert').click()
    await expect(context.page).toHaveURL(/#\/alerts/)

    await openDashboard(context.page)
    await context.page.getByTestId('dashboard-pending-action-pending-upgrade-1').click()
    await expect(context.page).toHaveURL(/#\/upgrade-plans/)

    await openDashboard(context.page)
    await expect(context.page.getByTestId('dashboard-page')).toBeVisible()
  } finally {
    await closeElectronApp(context)
  }
})
