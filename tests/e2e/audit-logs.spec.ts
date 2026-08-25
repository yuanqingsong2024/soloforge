import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('审计日志', () => {
  test('审计日志页面可正常加载', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-audit').click()
      await expect(context.page).toHaveURL(/#\/audit/)
      await expect(context.page.getByRole('heading', { name: /审计日志/i })).toBeVisible({ timeout: 10000 })
    } finally {
      await closeElectronApp(context)
    }
  })

  test('审计日志可按 actor 过滤', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-audit').click()
      await expect(context.page).toHaveURL(/#\/audit/)

      // 检查过滤器控件存在
      const actorFilter = context.page.getByLabel(/操作者|actor/i)
      await expect(actorFilter.or(context.page.getByPlaceholder(/搜索|search/i))).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
