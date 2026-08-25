import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

test.describe('工单看板', () => {
  test('看板页面可正常加载且显示状态列', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-tickets').click()
      await expect(context.page).toHaveURL(/#\/tickets/)
      
      // 页面标题
      await expect(context.page.getByRole('heading', { name: '工单看板' })).toBeVisible({ timeout: 10000 })
      
      // 验证看板状态列存在（使用中文标签）
      await expect(context.page.getByText('收件箱').first()).toBeVisible({ timeout: 5000 })
    } finally {
      await closeElectronApp(context)
    }
  })

  test('可通过看板创建新工单', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const ticketTitle = `E2E 测试工单 ${Date.now()}`

    try {
      await waitForDashboardReady(context.page)
      await context.page.evaluate(() => {
        localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
        localStorage.setItem('soloforge-display-mode', 'expert')
      })

      await context.page.getByTestId('sidebar-link-tickets').click()
      await expect(context.page).toHaveURL(/#\/tickets/)

      // 点击新建工单按钮
      const newTicketButton = context.page.getByRole('button', { name: /创建工单/i }).first()
      
      // 设置 dialog 处理程序（在点击之前）
      context.page.on('dialog', async dialog => {
        await dialog.accept(ticketTitle)
      })
      
      await newTicketButton.click()

      // 验证工单已创建（通过 API 确认）
      const tickets = await apiJson<{ success: boolean; data?: { id: string; title: string }[] }>(
        context.page,
        `/api/tickets?workspaceId=00000000-0000-0000-0000-000000000001&page=1&pageSize=50`
      )

      if (tickets.success && tickets.data) {
        const created = tickets.data.find(t => t.title === ticketTitle)
        expect(created).toBeDefined()
      }
    } finally {
      await closeElectronApp(context)
    }
  })
})
