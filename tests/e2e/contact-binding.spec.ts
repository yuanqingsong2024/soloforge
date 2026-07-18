import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

test.describe('联系人管理稳定回归', () => {
  test('联系人绑定到工单后在工单详情自动选中', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const contactName = `E2E绑定联系人-${Date.now()}`
    const targetDisplay = `E2E目标-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)

      const profile = await apiJson<{ id: string }>(context.page, '/api/comms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `E2E-Profile-${Date.now()}`, provider: 'openclaw', enabled: true })
      })

      const targetResult = await apiJson<{ target: { id: string } }>(context.page, '/api/comms/targets', {
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

      const contact = await apiJson<{ id: string }>(context.page, '/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: contactName, tags: ['e2e'], notes: '绑定到工单测试' })
      })

      await apiJson(context.page, `/api/contacts/${contact.id}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commsTargetId: targetResult.target.id, isPrimary: true })
      })

      const ticket = await apiJson<{ id: string }>(context.page, '/api/tickets', {
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

      await apiJson(context.page, `/api/tickets/${ticket.id}/contact`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, primaryTargetId: targetResult.target.id })
      })

      await context.page.evaluate((ticketId) => {
        window.location.hash = `#/tickets/${ticketId}`
      }, ticket.id)
      await expect(context.page).toHaveURL(new RegExp(`#\/tickets\/${ticket.id}`))

      await context.page.getByText('Compose & Send').scrollIntoViewIfNeeded()

      const contactSelect = context.page.locator('select').filter({
        has: context.page.locator(`option[value="${contact.id}"]`)
      }).first()
      await expect(contactSelect).toHaveValue(contact.id)

      const targetSelect = context.page.locator('select').filter({
        has: context.page.locator(`option[value="${targetResult.target.id}"]`)
      }).first()
      await expect(targetSelect).toHaveValue(targetResult.target.id)
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
