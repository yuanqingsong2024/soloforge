import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('团队管理', () => {
  test('团队管理页面可正常加载', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-team').click()
      await expect(context.page).toHaveURL(/#\/team/)
      await expect(context.page.getByRole('heading', { name: '团队管理' })).toBeVisible({ timeout: 10000 })
      
      // 验证显示岗位和员工区域
      await expect(context.page.getByText(/岗位/).first()).toBeVisible()
      await expect(context.page.getByText(/员工/).first()).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })

  test('显示工具管理区域', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-team').click()
      await expect(context.page).toHaveURL(/#\/team/)

      // 验证工具管理区域加载（页面显示所有区块）
      await expect(context.page.getByText(/工具/).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
