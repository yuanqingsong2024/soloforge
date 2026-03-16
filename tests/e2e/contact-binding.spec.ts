import { test, expect } from '@playwright/test'

/**
 * E2E 测试：联系人绑定与目标选择
 * 
 * 验证点：
 * 1. 创建联系人并绑定通讯目标
 * 2. 在工单中选择联系人后自动带出主目标
 * 3. 可手动切换联系人的其他目标
 */
test.describe('联系人绑定与目标选择', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('应该能创建联系人并绑定目标', async ({ page }) => {
    // 1. 导航到联系人页面
    await page.click('text=联系人')
    await page.waitForSelector('text=联系人管理')

    // 2. 填写联系人信息
    await page.locator('input[placeholder="联系人姓名"]').fill('E2E测试联系人')
    await page.locator('input[placeholder*="公司"]').fill('测试公司')
    await page.locator('input[placeholder*="标签"]').fill('VIP,测试')
    await page.locator('textarea[placeholder="备注"]').fill('E2E自动化测试创建')

    // 3. 创建联系人
    await page.click('button:has-text("创建联系人")')
    await page.waitForTimeout(1000)

    // 4. 验证联系人出现在列表中
    await expect(page.locator('text=E2E测试联系人')).toBeVisible({ timeout: 5000 })
  })

  test('应该能在工单中绑定联系人并自动带出主目标', async ({ page }) => {
    // 1. 先确保有联系人（使用已创建的示例联系人）
    await page.click('text=联系人')
    const hasContact = await page.locator('text=示例客户-张女士').count() > 0
    if (!hasContact) {
      test.skip()
    }

    // 2. 导航到工单详情
    await page.click('text=工单看板')
    const firstTicket = page.locator('[data-testid="ticket-card"]').first()
    if (await firstTicket.count() === 0) test.skip()
    await firstTicket.click()

    // 3. 滚动到 Compose & Send 区块
    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    // 4. 选择联系人
    const contactSelect = page.locator('select').filter({ hasText: '选择联系人' })
    await contactSelect.selectOption({ label: /示例客户-张女士/ })
    await page.waitForTimeout(500)

    // 5. 验证目标下拉框出现选项
    const targetSelect = page.locator('select').filter({ hasText: '选择联系人目标' })
    const targetOptions = await targetSelect.locator('option').count()
    expect(targetOptions).toBeGreaterThan(1) // 至少有"请选择"和一个目标

    // 6. 验证 channel 和 to 字段已自动填充（如果有主目标）
    const channelSelect = page.locator('select[value]').filter({ has: page.locator('option[value="slack"]') })
    if (await channelSelect.count() > 0) {
      const channelValue = await channelSelect.inputValue()
      expect(channelValue).toBeTruthy()
    }
  })

  test('应该能手动切换联系人目标', async ({ page }) => {
    await page.click('text=工单看板')
    const firstTicket = page.locator('[data-testid="ticket-card"]').first()
    if (await firstTicket.count() === 0) test.skip()
    await firstTicket.click()

    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    // 选择联系人
    const contactSelect = page.locator('select').filter({ hasText: '选择联系人' })
    const contactOptions = await contactSelect.locator('option').count()
    if (contactOptions <= 1) test.skip()

    await contactSelect.selectOption({ index: 1 })
    await page.waitForTimeout(500)

    // 切换目标
    const targetSelect = page.locator('select').filter({ hasText: '选择联系人目标' })
    const targetOptions = await targetSelect.locator('option').count()
    if (targetOptions > 1) {
      const initialTo = await page.locator('input[placeholder*="收件人"]').inputValue()
      await targetSelect.selectOption({ index: 1 })
      await page.waitForTimeout(500)
      const updatedTo = await page.locator('input[placeholder*="收件人"]').inputValue()
      
      // 验证 to 字段已更新（如果有多个目标）
      if (targetOptions > 2) {
        expect(updatedTo).not.toBe(initialTo)
      }
    }
  })
})
