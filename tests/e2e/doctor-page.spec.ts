import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('健康监控', () => {
  test('健康监控页面可正常加载', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      // 直接通过 URL 导航（侧边栏分组默认折叠）
      await context.page.goto(context.page.url().split('#')[0] + '#/health-monitoring')
      await expect(context.page).toHaveURL(/#\/health-monitoring/)
      await expect(context.page.getByRole('heading', { name: '健康监控' })).toBeVisible({ timeout: 10000 })
    } finally {
      await closeElectronApp(context)
    }
  })

  test('诊断中心显示检查项', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.goto(context.page.url().split('#')[0] + '#/health-monitoring')
      await expect(context.page).toHaveURL(/#\/health-monitoring/)
      await expect(context.page.getByRole('button', { name: '诊断中心' })).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
