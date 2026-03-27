import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('联系人管理稳定回归', () => {
  test('联系人绑定到工单后在工单详情自动选中', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const contactName = `E2E绑定联系人-${Date.now()}`
    const targetDisplay = `E2E目标-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)

      const ids = await context.page.evaluate(async ({ contactName, targetDisplay }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const profileResponse = await fetch(`http://127.0.0.1:${port}/api/comms/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `E2E-Profile-${Date.now()}`, provider: 'openclaw', enabled: true })
        })
        const profile = await profileResponse.json() as { id: string }

        const targetResponse = await fetch(`http://127.0.0.1:${port}/api/comms/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commsProfileId: profile.id,
            channel: 'slack',
            to: `e2e-${Date.now()}-channel`,
            displayName: targetDisplay,
            allowlisted: false
          })
        })
        const targetResult = await targetResponse.json() as { target: { id: string } }

        const contactResponse = await fetch(`http://127.0.0.1:${port}/api/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: contactName, tags: ['e2e'], notes: '绑定到工单测试' })
        })
        const contact = await contactResponse.json() as { id: string }

        await fetch(`http://127.0.0.1:${port}/api/contacts/${contact.id}/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commsTargetId: targetResult.target.id, isPrimary: true })
        })

        const ticketResponse = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `E2E工单-${Date.now()}`,
            source: 'e2e',
            status: 'INBOX',
            priority: 'MEDIUM',
            customerMeta: '{}'
          })
        })
        const ticket = await ticketResponse.json() as { id: string }

        await fetch(`http://127.0.0.1:${port}/api/tickets/${ticket.id}/contact`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: contact.id, primaryTargetId: targetResult.target.id })
        })

        return { contactId: contact.id, targetId: targetResult.target.id, ticketId: ticket.id }
      }, { contactName, targetDisplay })

      await context.page.evaluate((ticketId) => {
        window.location.hash = `#/tickets/${ticketId}`
      }, ids.ticketId)
      await expect(context.page).toHaveURL(new RegExp(`#\\/tickets\\/${ids.ticketId}`))

      await context.page.getByText('Compose & Send').scrollIntoViewIfNeeded()

      const contactSelect = context.page.locator('select').filter({
        has: context.page.locator(`option[value="${ids.contactId}"]`)
      }).first()
      await expect(contactSelect).toHaveValue(ids.contactId)

      const targetSelect = context.page.locator('select').filter({
        has: context.page.locator(`option[value="${ids.targetId}"]`)
      }).first()
      await expect(targetSelect).toHaveValue(ids.targetId)
    } finally {
      await closeElectronApp(context)
    }
  })

  test('应该能在联系人页创建联系人并立即看到结果', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const contactName = `E2E联系人-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-contacts').click()
      await expect(context.page).toHaveURL(/#\/contacts/)
      await expect(context.page.getByRole('heading', { name: '联系人管理' })).toBeVisible()

      await context.page.getByPlaceholder('联系人姓名').fill(contactName)
      await context.page.getByPlaceholder('公司（可选）').fill('E2E测试公司')
      await context.page.getByPlaceholder('标签，逗号分隔').fill('稳定回归,联系人')
      await context.page.getByPlaceholder('备注').fill('Electron E2E 自动创建联系人')
      await context.page.getByRole('button', { name: '创建联系人' }).click()

      await expect(context.page.getByText(`${contactName} / E2E测试公司`)).toBeVisible({ timeout: 10000 })
    } finally {
      await closeElectronApp(context)
    }
  })
})
