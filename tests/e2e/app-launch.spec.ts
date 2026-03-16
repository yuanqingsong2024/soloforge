import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test('启动 Electron 后可见 Dashboard 与基础布局', async ({}, testInfo) => {
  const context = await launchElectronApp(testInfo)

  try {
    await waitForDashboardReady(context.page)
    await expect(context.page).toHaveTitle(/SoloForge/i)
    await expect(context.page.getByTestId('app-sidebar')).toBeVisible()
    await expect(context.page.getByTestId('app-topbar')).toBeVisible()
    await expect(context.page.getByRole('heading', { name: '总控首页' })).toBeVisible()
  } finally {
    await closeElectronApp(context)
  }
})
