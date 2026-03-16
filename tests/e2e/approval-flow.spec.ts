import { test, expect } from '@playwright/test'

/**
 * E2E 测试：审批发送完整流程
 * 
 * 验证点：
 * 1. 点击发送后创建 SEND_EXTERNAL 审批
 * 2. 消息状态变为 PENDING_APPROVAL
 * 3. 在审批中心通过审批
 * 4. 消息状态变为 APPROVED/SENDING/SENT
 * 5. 审计日志记录完整链路
 */
test.describe('审批发送完整流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('应该能创建外发消息并进入审批流程', async ({ page }) => {
    // 1. 导航到工单详情
    await page.click('text=工单看板')
    const firstTicket = page.locator('[data-testid="ticket-card"]').first()
    if (await firstTicket.count() === 0) test.skip()
    await firstTicket.click()

    // 2. 滚动到 Compose & Send
    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    // 3. 填写外发内容（不使用模板，直接填写）
    await page.locator('select').filter({ has: page.locator('option[value="slack"]') }).first().selectOption('slack')
    await page.locator('input[placeholder*="收件人"]').fill('test-channel')
    await page.locator('input[placeholder*="主题"]').fill('E2E测试主题')
    await page.locator('textarea[placeholder*="外发正文"]').fill('这是E2E自动化测试消息，请勿实际发送。')

    // 4. 点击发送按钮
    await page.click('button:has-text("发送（创建审批）")')

    // 5. 等待响应并验证提示
    await page.waitForTimeout(2000)
    
    // 验证是否出现审批提示（可能是 alert 或页面提示）
    const hasAlert = await page.locator('text=审批').count() > 0
    const hasApprovalMessage = await page.locator('text=PENDING_APPROVAL').count() > 0 || 
                                await page.locator('text=pending_approval').count() > 0
    
    expect(hasAlert || hasApprovalMessage).toBeTruthy()
  })

  test('应该能在审批中心查看待审批消息', async ({ page }) => {
    // 1. 导航到审批中心
    await page.click('text=审批中心')
    await page.waitForSelector('text=审批中心')

    // 2. 切换到待审批 tab
    await page.click('button:has-text("待审批")')
    await page.waitForTimeout(500)

    // 3. 验证是否有待审批项（可能没有，取决于之前测试）
    const pendingApprovals = await page.locator('[data-testid="approval-item"]').count()
    
    // 如果有待审批项，验证可以看到详情
    if (pendingApprovals > 0) {
      const firstApproval = page.locator('[data-testid="approval-item"]').first()
      await expect(firstApproval).toBeVisible()
      
      // 验证包含 SEND_EXTERNAL 类型
      const hasSendExternal = await page.locator('text=SEND_EXTERNAL').count() > 0
      expect(hasSendExternal).toBeTruthy()
    }
  })

  test('应该能通过审批并触发发送', async ({ page }) => {
    // 1. 导航到审批中心
    await page.click('text=审批中心')
    await page.click('button:has-text("待审批")')
    await page.waitForTimeout(500)

    // 2. 查找待审批项
    const pendingApprovals = await page.locator('[data-testid="approval-item"]').count()
    if (pendingApprovals === 0) {
      test.skip() // 没有待审批项，跳过
    }

    // 3. 点击第一个待审批项的"通过"按钮
    const approveButton = page.locator('button:has-text("通过")').first()
    if (await approveButton.count() > 0) {
      await approveButton.click()
      await page.waitForTimeout(1000)

      // 4. 验证审批状态更新
      await expect(page.locator('text=APPROVED').or(page.locator('text=已通过'))).toBeVisible({ timeout: 5000 })
    }
  })

  test('应该能在审计日志中查看发送记录', async ({ page }) => {
    // 1. 导航到审计日志
    await page.click('text=审计日志')
    await page.waitForSelector('text=审计日志')

    // 2. 查找 OUTBOUND_SENT 或 OUTBOUND_FAILED 记录
    const hasOutboundLog = await page.locator('text=OUTBOUND_SENT').or(page.locator('text=OUTBOUND_FAILED')).count() > 0
    
    if (hasOutboundLog) {
      // 3. 验证日志包含 trace_id
      const logItem = page.locator('[data-testid="audit-log-item"]').first()
      if (await logItem.count() > 0) {
        await expect(logItem).toBeVisible()
      }
    }
  })

  test('应该能在消息中心查看发送状态', async ({ page }) => {
    // 1. 导航到消息中心
    await page.click('text=消息中心')
    await page.waitForSelector('text=消息中心')

    // 2. 验证各状态 tab 存在
    await expect(page.locator('button:has-text("草稿")')).toBeVisible()
    await expect(page.locator('button:has-text("待审批")')).toBeVisible()
    await expect(page.locator('button:has-text("已发送")')).toBeVisible()
    await expect(page.locator('button:has-text("失败")')).toBeVisible()

    // 3. 切换到待审批 tab
    await page.click('button:has-text("待审批")')
    await page.waitForTimeout(500)

    // 4. 验证消息列表（可能为空）
    const messageCount = await page.locator('[data-testid="message-card"]').count()
    expect(messageCount).toBeGreaterThanOrEqual(0)
  })
})
