import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('配置中心', () => {
  test('配置中心页面可正常加载', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      // 配置中心路径是 /openclaw-config
      await context.page.goto(context.page.url().split('#')[0] + '#/openclaw-config')
      await expect(context.page).toHaveURL(/#\/openclaw-config/)
      
      // 验证页面有内容区域
      await expect(context.page.locator('main').first()).toBeVisible({ timeout: 10000 })
    } finally {
      await closeElectronApp(context)
    }
  })

  test('配置中心显示编辑功能', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.goto(context.page.url().split('#')[0] + '#/openclaw-config')
      await expect(context.page).toHaveURL(/#\/openclaw-config/)

      // 验证页面有按钮元素
      await expect(context.page.locator('button').first()).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
