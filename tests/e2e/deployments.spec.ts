import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('部署管理', () => {
  test('部署管理页面可正常加载', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-deployments').click()
      await expect(context.page).toHaveURL(/#\/deployments/)
      await expect(context.page.getByRole('heading', { name: '部署管理' })).toBeVisible({ timeout: 10000 })
      
      // 验证显示目标列表或空状态
      const newTargetButton = context.page.getByRole('button', { name: /新建/i })
      await expect(newTargetButton.or(context.page.getByText(/暂无|empty/i)).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })

  test('显示部署类型', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-deployments').click()
      await expect(context.page).toHaveURL(/#\/deployments/)

      // 验证页面有内容区域
      await expect(context.page.locator('main').first()).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
