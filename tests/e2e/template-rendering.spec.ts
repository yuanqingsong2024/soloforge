import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('模板渲染稳定回归', () => {
  test('应该能创建模板并在工单内生成草稿预览', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const templateName = `E2E模板-${Date.now()}`
    const ticketTitle = `E2E工单-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)

      const ids = await context.page.evaluate(async ({ templateName, ticketTitle }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const ticketResponse = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: ticketTitle,
            source: 'e2e',
            status: 'INBOX',
            priority: 'MEDIUM',
            customerMeta: '{}'
          })
        })
        const ticket = await ticketResponse.json() as { id: string }

        const templateResponse = await fetch(`http://127.0.0.1:${port}/api/message-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateName,
            scenario: 'CUSTOM',
            contentFormat: 'MARKDOWN',
            subjectTemplate: '联系 {{contactName}}',
            bodyTemplate: '你好 {{contactName}}，工单 {{ticketTitle}} 已创建。',
            variablesSchema: {
              type: 'object',
              properties: {
                contactName: { title: '联系人', type: 'string' },
                ticketTitle: { title: '工单标题', type: 'string' }
              }
            },
            defaults: {
              contactName: '默认客户',
              ticketTitle
            },
            enabled: true
          })
        })
        const template = await templateResponse.json() as { id: string }

        return { ticketId: ticket.id, templateId: template.id }
      }, { templateName, ticketTitle })

      await context.page.evaluate((ticketId) => {
        window.location.hash = `#/tickets/${ticketId}`
      }, ids.ticketId)
      await expect(context.page).toHaveURL(new RegExp(`#\\/tickets\\/${ids.ticketId}`))

      await context.page.getByText('Compose & Send').scrollIntoViewIfNeeded()

      const templateOptionLabel = `${templateName} / CUSTOM`
      const templateSelect = context.page.locator('select').filter({
        has: context.page.locator(`option:has-text("${templateName}")`)
      }).last()
      await templateSelect.selectOption({ label: templateOptionLabel })

      await context.page.getByPlaceholder('联系人').fill('E2E客户')
      await context.page.getByPlaceholder('工单标题').fill(ticketTitle)
      await context.page.getByPlaceholder('收件人 / 频道 ID').fill('e2e-channel')
      await context.page.getByRole('button', { name: '生成草稿（DRAFT）' }).click()

      await expect(context.page.getByText('模板预览')).toBeVisible({ timeout: 10000 })

      const bodyTextarea = context.page.getByPlaceholder('外发正文（支持 Markdown）')
      await expect(bodyTextarea).toHaveValue(/E2E客户/)
    } finally {
      await closeElectronApp(context)
    }
  })
})
