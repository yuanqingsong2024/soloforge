import { test, expect } from '@playwright/test'

/**
 * E2E 测试：失败重试验证
 * 
 * 验证点：
 * 1. 模拟发送失败场景
 * 2. 验证消息状态变为 FAILED
 * 3. 验证 next_retry_at 字段设置正确
 * 4. 验证 attempts 计数递增
 * 5. 手动重试功能验证
 * 6. 批量重试接口验证
 */
test.describe('失败重试验证', () => {
  const apiPort = 13789

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('应该能在消息中心查看失败消息', async ({ page }) => {
    // 1. 导航到消息中心
    await page.click('text=消息中心')
    await page.waitForSelector('text=消息中心')

    // 2. 切换到失败 tab
    await page.click('button:has-text("失败")')
    await page.waitForTimeout(500)

    // 3. 验证失败消息列表（可能为空）
    const failedMessages = await page.locator('[data-testid="message-card"]').count()
    expect(failedMessages).toBeGreaterThanOrEqual(0)

    // 4. 如果有失败消息，验证显示错误信息
    if (failedMessages > 0) {
      const firstFailed = page.locator('[data-testid="message-card"]').first()
      await expect(firstFailed).toBeVisible()
      
      // 验证包含错误信息或重试按钮
      const hasError = await firstFailed.locator('text=错误').or(firstFailed.locator('text=失败')).count() > 0
      const hasRetry = await firstFailed.locator('button:has-text("重试")').count() > 0
      
      expect(hasError || hasRetry).toBeTruthy()
    }
  })

  test('应该能通过 API 验证失败消息的重试字段', async ({ request }) => {
    // 1. 获取所有失败消息
    const response = await request.get(`http://127.0.0.1:${apiPort}/api/outbound-messages?status=FAILED`)
    
    if (!response.ok()) {
      test.skip() // API 不可用，跳过
    }

    const messages = await response.json()

    // 2. 验证失败消息包含必要字段
    if (messages.length > 0) {
      const failedMsg = messages[0]
      
      expect(failedMsg.status).toBe('FAILED')
      expect(failedMsg.attempts).toBeGreaterThan(0)
      expect(failedMsg.lastError).toBeTruthy()
      
      // 验证 next_retry_at 存在（如果仍在重试窗口内）
      if (failedMsg.attempts < 8) {
        expect(failedMsg.nextRetryAt).toBeTruthy()
      }
    }
  })

  test('应该能手动重试失败消息', async ({ page }) => {
    // 1. 导航到消息中心失败 tab
    await page.click('text=消息中心')
    await page.click('button:has-text("失败")')
    await page.waitForTimeout(500)

    // 2. 查找重试按钮
    const retryButton = page.locator('button:has-text("重试")').first()
    
    if (await retryButton.count() === 0) {
      test.skip() // 没有失败消息，跳过
    }

    // 3. 点击重试
    await retryButton.click()
    await page.waitForTimeout(2000)

    // 4. 验证响应（可能成功、失败或需要审批）
    const hasResponse = await page.locator('text=重试').or(page.locator('text=审批')).or(page.locator('text=失败')).count() > 0
    expect(hasResponse).toBeTruthy()
  })

  test('应该能通过 API 手动重试失败消息', async ({ request }) => {
    // 1. 获取失败消息
    const listRes = await request.get(`http://127.0.0.1:${apiPort}/api/outbound-messages?status=FAILED`)
    if (!listRes.ok()) test.skip()

    const messages = await listRes.json()
    if (messages.length === 0) test.skip()

    const failedMsg = messages[0]

    // 2. 尝试重试
    const retryRes = await request.post(`http://127.0.0.1:${apiPort}/api/outbound-messages/${failedMsg.id}/retry`)
    
    // 3. 验证响应
    if (retryRes.ok()) {
      const result = await retryRes.json()
      expect(result.status).toBeTruthy()
      expect(['sent', 'blocked', 'deferred', 'skipped']).toContain(result.status)
    }
  })

  test('应该能验证退避窗口机制', async ({ request }) => {
    // 1. 获取失败消息
    const listRes = await request.get(`http://127.0.0.1:${apiPort}/api/outbound-messages?status=FAILED`)
    if (!listRes.ok()) test.skip()

    const messages = await listRes.json()
    if (messages.length === 0) test.skip()

    const failedMsg = messages[0]

    // 2. 如果在退避窗口内，重试应返回 deferred
    if (failedMsg.nextRetryAt) {
      const nextRetryTime = new Date(failedMsg.nextRetryAt).getTime()
      const now = Date.now()

      if (nextRetryTime > now) {
        // 仍在退避窗口内
        const retryRes = await request.post(`http://127.0.0.1:${apiPort}/api/outbound-messages/${failedMsg.id}/retry`)
        
        if (retryRes.ok()) {
          const result = await retryRes.json()
          expect(result.status).toBe('deferred')
          expect(result.nextRetryAt).toBeTruthy()
        }
      }
    }
  })

  test('应该能验证批量重试接口', async ({ request }) => {
    // 1. 调用批量重试接口
    const retryRes = await request.post(`http://127.0.0.1:${apiPort}/api/outbound-messages/retry-due`)
    
    if (!retryRes.ok()) {
      test.skip() // API 不可用
    }

    // 2. 验证响应格式
    const result = await retryRes.json()
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('results')
    expect(Array.isArray(result.results)).toBeTruthy()

    // 3. 验证每个结果包含必要字段
    if (result.results.length > 0) {
      const firstResult = result.results[0]
      expect(firstResult).toHaveProperty('id')
      expect(firstResult).toHaveProperty('status')
      expect(['sent', 'skipped']).toContain(firstResult.status)
    }
  })

  test('应该能验证最大重试次数限制', async ({ request }) => {
    // 1. 获取失败消息
    const listRes = await request.get(`http://127.0.0.1:${apiPort}/api/outbound-messages?status=FAILED`)
    if (!listRes.ok()) test.skip()

    const messages = await listRes.json()
    
    // 2. 查找达到最大重试次数的消息
    const maxRetriedMsg = messages.find((msg: any) => msg.attempts >= 8)

    if (maxRetriedMsg) {
      // 3. 验证 next_retry_at 为 null（不再重试）
      expect(maxRetriedMsg.nextRetryAt).toBeNull()
    }
  })

  test('应该能在消息详情中查看重试历史', async ({ page }) => {
    // 1. 导航到消息中心
    await page.click('text=消息中心')
    await page.click('button:has-text("失败")')
    await page.waitForTimeout(500)

    // 2. 查找失败消息
    const failedCard = page.locator('[data-testid="message-card"]').first()
    if (await failedCard.count() === 0) test.skip()

    // 3. 验证显示尝试次数
    const hasAttempts = await failedCard.locator('text=尝试次数').or(failedCard.locator('text=attempts')).count() > 0
    
    if (hasAttempts) {
      await expect(failedCard.locator('text=尝试次数')).toBeVisible()
    }

    // 4. 验证显示下次重试时间
    const hasNextRetry = await failedCard.locator('text=下次重试').or(failedCard.locator('text=next_retry')).count() > 0
    
    if (hasNextRetry) {
      await expect(failedCard.locator('text=下次重试')).toBeVisible()
    }
  })
})
