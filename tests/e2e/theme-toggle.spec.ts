import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test('切换主题不会导致 Dashboard 崩溃', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo)

  try {
    await waitForDashboardReady(context.page)

    await context.page.getByTestId('theme-toggle').click()
    await expect(context.page.locator('html')).toHaveAttribute('data-theme', /dark|light/)

    await context.page.getByTestId('theme-toggle').click()
    await expect(context.page.getByTestId('dashboard-page')).toBeVisible()
    await expect(context.page.getByTestId('dashboard-global-overview')).toBeVisible()
  } finally {
    await closeElectronApp(context)
  }
})
