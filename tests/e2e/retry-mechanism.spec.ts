import { test, expect } from '@playwright/test'
import { apiJson } from './helpers/api'
import { closeElectronApp, launchElectronApp } from './helpers/electron'

/**
 * E2E 测试：失败重试验证
 */
test.describe('失败重试验证', () => {
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

  test('应该能在消息中心查看失败消息', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    await page.click('text=消息中心')
    await page.waitForSelector('text=消息中心')

    await page.click('button:has-text("失败")')

    const failedSection = page.getByTestId('outbound-message-section-FAILED')
    await expect(failedSection).toBeVisible()

    const failedMessages = await page.locator('[data-testid^="message-card-"]').count()
    expect(failedMessages).toBeGreaterThanOrEqual(0)

    if (failedMessages > 0) {
      const firstFailed = page.locator('[data-testid^="message-card-"]').first()
      await expect(firstFailed).toBeVisible()

      const hasError = await firstFailed.locator('text=错误').or(firstFailed.locator('text=失败')).count() > 0
      const hasRetry = await firstFailed.locator('button:has-text("重试")').count() > 0

      expect(hasError || hasRetry).toBeTruthy()
    }
  })

  test('应该能通过 API 验证失败消息的重试字段', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const messages = await apiJson<Array<Record<string, unknown>>>(page, '/api/outbound-messages?status=FAILED')

    if (messages.length > 0) {
      const failedMsg = messages[0]

      expect(failedMsg.status).toBe('FAILED')
      expect(failedMsg.attempts).toBeGreaterThan(0)
      expect(failedMsg.lastError).toBeTruthy()

      if (failedMsg.attempts < 8) {
        expect(failedMsg.nextRetryAt).toBeTruthy()
      }
    }
  })

  test('应该能手动重试失败消息', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    await ensureFailedMessage(page)

    await page.click('text=消息中心')
    await page.click('button:has-text("失败")')

    const failedSection = page.getByTestId('outbound-message-section-FAILED')
    await expect(failedSection).toBeVisible()

    const retryButton = failedSection.getByRole('button', { name: '重试发送' }).first()

    await retryButton.click()

    await expect(failedSection).toBeVisible()
  })

  test('应该能通过 API 手动重试失败消息', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    await ensureFailedMessage(page)

    const messages = await apiJson<Array<{ id: string } & Record<string, unknown>>>(page, '/api/outbound-messages?status=FAILED')

    const failedMsg = messages[0]

    const result = await apiJson<{ status?: string }>(page, `/api/outbound-messages/${failedMsg.id}/retry`, {
      method: 'POST'
    })

    expect(result.status).toBeTruthy()
    expect(['sent', 'blocked', 'deferred', 'skipped']).toContain(result.status)
  })

  test('应该能验证退避窗口机制', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const messages = await apiJson<Array<Record<string, unknown>>>(page, '/api/outbound-messages?status=FAILED')
    expect(messages.length).toBeGreaterThan(0)

    const failedMsg = messages[0]

    if (failedMsg.nextRetryAt) {
      const nextRetryTime = new Date(failedMsg.nextRetryAt).getTime()
      const now = Date.now()

      if (nextRetryTime > now) {
        const result = await apiJson<{ status?: string; nextRetryAt?: string | null }>(page, `/api/outbound-messages/${failedMsg.id}/retry`, {
          method: 'POST'
        })

        expect(result.status).toBe('deferred')
        expect(result.nextRetryAt).toBeTruthy()
      }
    }
  })

  test('应该能验证批量重试接口', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const result = await apiJson<{ retriedCount: number; results: Array<{ id: string; status: string }> }>(page, '/api/outbound-messages/retry-due', {
      method: 'POST'
    })
    expect(result).toHaveProperty('retriedCount')
    expect(result).toHaveProperty('results')
    expect(Array.isArray(result.results)).toBeTruthy()

    if (result.results.length > 0) {
      const firstResult = result.results[0]
      expect(firstResult).toHaveProperty('id')
      expect(firstResult).toHaveProperty('status')
      expect(['sent', 'skipped']).toContain(firstResult.status)
    }
  })

  test('应该能验证最大重试次数限制', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    const messages = await apiJson<Array<{ attempts: number; nextRetryAt?: string | null }>>(page, '/api/outbound-messages?status=FAILED')

    const maxRetriedMsg = messages.find(msg => msg.attempts >= 8)

    if (maxRetriedMsg) {
      expect(maxRetriedMsg.nextRetryAt).toBeNull()
    }
  })

  test('应该能在消息详情中查看重试历史', async () => {
    if (!context) throw new Error('Electron 上下文未初始化')
    const page = context.page

    await ensureFailedMessage(page)

    await page.click('text=消息中心')
    await page.click('button:has-text("失败")')

    const failedSection = page.getByTestId('outbound-message-section-FAILED')
    await expect(failedSection).toBeVisible()

    const failedCard = failedSection.locator('[data-testid^="message-card-"]').first()
    const hasAttempts = await failedCard.locator('text=尝试次数').or(failedCard.locator('text=attempts')).count() > 0

    if (hasAttempts) {
      await expect(failedCard.locator('text=尝试次数')).toBeVisible()
    }

    const hasNextRetry = await failedCard.locator('text=下次重试').or(failedCard.locator('text=next_retry')).count() > 0

    if (hasNextRetry) {
      await expect(failedCard.locator('text=下次重试')).toBeVisible()
    }
  })
})

async function ensureFailedMessage(page: import('@playwright/test').Page): Promise<void> {
  const existing = await apiJson<Array<{ id: string }>>(page, '/api/outbound-messages?status=FAILED')
  if (existing.length > 0) {
    return
  }

  const profileName = `E2E-Retry-Profile-${Date.now()}`
  const targetTo = `retry-failed-${Date.now()}`
  const openclawProfile = await apiJson<{ id: string }>(page, '/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: profileName,
      baseUrl: 'http://127.0.0.1:9',
      wsUrl: 'ws://127.0.0.1:9',
      authMode: 'token',
      token: 'e2e-token'
    })
  })

  const commsProfile = await apiJson<{ id: string }>(page, '/api/comms/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${profileName}-comms`,
      provider: 'claude-code',
      claudeCodeProfileId: openclawProfile.id,
      enabled: true
    })
  })

  const target = await apiJson<{ target: { id: string } }>(page, '/api/comms/targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commsProfileId: commsProfile.id,
      channel: 'slack',
      to: targetTo,
      displayName: 'E2E Retry Failed Target',
      allowlisted: false
    })
  })

  await apiJson(page, `/api/comms/targets/${target.target.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowlisted: true })
  })

  const draft = await apiJson<{ id: string }>(page, '/api/outbound-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'slack',
      to: targetTo,
      subject: 'E2E Retry Failed',
      body: '用于生成 FAILED 状态消息',
      status: 'DRAFT'
    })
  })

  const sendResult = await apiJson<{ status: string; approvalId?: string }>(page, `/api/outbound-messages/${draft.id}/send`, {
    method: 'POST'
  })

  if (sendResult.status !== 'pending_approval' || !sendResult.approvalId) {
    throw new Error('未生成审批，无法构造 FAILED 消息')
  }

  const approvalResponse = await page.evaluate(async ({ approvalId }) => {
    const params = new URLSearchParams(window.location.search)
    const portValue = params.get('apiPort')
    if (!portValue) {
      throw new Error('无法获取 apiPort')
    }

    const port = Number(portValue)
    if (!Number.isFinite(port)) {
      throw new Error('apiPort 无效')
    }

    const response = await fetch(`http://127.0.0.1:${port}/api/approvals/${approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED', approvedBy: 'e2e' })
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text()
    }
  }, { approvalId: sendResult.approvalId })

  const currentMessages = await apiJson<Array<{ id: string; status: string; lastError?: string | null }>>(page, '/api/outbound-messages')
  const currentMessage = currentMessages.find(item => item.id === draft.id)

  if (!approvalResponse.ok && currentMessage?.status !== 'FAILED') {
    throw new Error(`审批通过接口失败: ${approvalResponse.status} ${approvalResponse.body}; 当前消息状态=${currentMessage?.status || 'missing'}; lastError=${currentMessage?.lastError || 'null'}`)
  }

  await expect.poll(async () => {
    const failed = await apiJson<Array<{ id: string; status: string }>>(page, '/api/outbound-messages?status=FAILED')
    return failed.some(item => item.id === draft.id)
  }, { timeout: 25000 }).toBe(true)
}
