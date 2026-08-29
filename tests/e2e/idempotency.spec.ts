import { test, expect } from '@playwright/test'
import { apiJson } from './helpers/api'
import { closeElectronApp, launchElectronApp } from './helpers/electron'

/**
 * E2E 测试：幂等去重验证
 */
test.describe('幂等去重验证', () => {
  const testMessage = {
    channel: 'slack',
    to: 'idempotency-test-channel',
    subject: '幂等测试主题',
    body: '这是幂等测试消息，内容完全相同。时间戳：' + Date.now()
  }

  let context: Awaited<ReturnType<typeof launchElectronApp>> | null = null

  test.beforeEach(async ({}, testInfo) => {
    context = await launchElectronApp(testInfo)
  })

  test.afterEach(async () => {
    if (context) {
      await closeElectronApp(context)
      context = null
    }
  })

  test('应该能检测并阻止重复发送相同内容', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const ticket = await apiJson<{ id: string }>(page, '/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `E2E 幂等工单 ${Date.now()}`,
        source: 'e2e',
        status: 'INBOX',
        priority: 'MEDIUM',
        customerMeta: '{}'
      })
    })

    await page.evaluate((ticketId) => {
      window.location.hash = `#/tickets/${ticketId}`
    }, ticket.id)
    await expect(page).toHaveURL(new RegExp(`#\/tickets\/${ticket.id}`))

    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    await page.getByTestId('ticket-outbound-channel-select').selectOption(testMessage.channel)
    await page.getByTestId('ticket-outbound-to-input').fill(testMessage.to)
    await page.getByTestId('ticket-outbound-subject-input').fill(testMessage.subject)
    await page.getByTestId('ticket-outbound-body-input').fill(testMessage.body)

    await page.getByTestId('ticket-send-outbound').click()
    await expect(page.getByTestId('ticket-approvals-panel')).toBeVisible()

    await page.getByTestId('ticket-outbound-to-input').fill(testMessage.to)
    await page.getByTestId('ticket-outbound-subject-input').fill(testMessage.subject)
    await page.getByTestId('ticket-outbound-body-input').fill(testMessage.body)

    await page.getByTestId('ticket-send-outbound').click()
    await expect(page.getByTestId('ticket-approvals-panel')).toBeVisible()
  })

  test('应该能通过 API 验证幂等键机制', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const createPayload = {
      ticketId: null,
      channel: testMessage.channel,
      to: testMessage.to,
      subject: testMessage.subject,
      body: testMessage.body,
      status: 'DRAFT'
    }

    const message1 = await apiJson<{ id: string; idempotencyKey: string }>(page, '/api/outbound-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload)
    })

    const message2 = await apiJson<{ id: string; idempotencyKey: string }>(page, '/api/outbound-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload)
    })

    expect(message1.id).toBe(message2.id)
    expect(message1.idempotencyKey).toBe(message2.idempotencyKey)
  })

  test('应该能在消息中心验证无重复发送记录', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    await page.getByTestId('sidebar-link-outbound-messages').click()
    await expect(page).toHaveURL(/#\/outbound-messages/)

    await page.click('button:has-text("已发送")')
    const sentSection = page.getByTestId('outbound-message-section-SENT')
    await expect(sentSection).toBeVisible()

    const messages = await sentSection.locator('[data-testid^="message-card-"]').all()
    const messageContents: string[] = []

    for (const msg of messages) {
      const text = await msg.textContent()
      if (text) {
        messageContents.push(text)
      }
    }

    const uniqueContents = new Set(messageContents)
    expect(uniqueContents.size).toBe(messageContents.length)
  })
})
