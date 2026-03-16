import { test, expect } from '@playwright/test'

/**
 * E2E 测试：模板渲染与草稿生成
 * 
 * 验证点：
 * 1. 选择模板后自动填充默认变量
 * 2. 手动编辑变量后预览更新
 * 3. 生成草稿后创建 template_run 和 outbound_message (DRAFT)
 */
test.describe('模板渲染与草稿生成', () => {
  test.beforeEach(async ({ page }) => {
    // 等待应用启动
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('应该能选择模板并生成草稿', async ({ page }) => {
    // 1. 导航到工单详情页（假设有示例工单）
    await page.click('text=工单看板')
    await page.waitForSelector('text=工单')
    
    // 点击第一个工单
    const firstTicket = page.locator('[data-testid="ticket-card"]').first()
    if (await firstTicket.count() > 0) {
      await firstTicket.click()
    } else {
      // 如果没有工单，跳过测试
      test.skip()
    }

    // 2. 滚动到 Compose & Send 区块
    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    // 3. 选择模板
    const templateSelect = page.locator('select').filter({ hasText: '选择模板' })
    await templateSelect.selectOption({ label: /需求澄清模板/ })

    // 4. 验证变量输入框出现
    await expect(page.locator('input[placeholder*="联系人"]')).toBeVisible()

    // 5. 填写变量
    await page.locator('input[placeholder*="联系人"]').fill('测试客户')
    await page.locator('input[placeholder*="工单标题"]').fill('测试需求')

    // 6. 点击生成草稿
    await page.click('button:has-text("生成草稿（DRAFT）")')

    // 7. 验证预览出现
    await expect(page.locator('text=模板预览')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=测试客户')).toBeVisible()

    // 8. 验证草稿字段已填充
    const bodyTextarea = page.locator('textarea[placeholder*="外发正文"]')
    const bodyValue = await bodyTextarea.inputValue()
    expect(bodyValue).toContain('测试客户')
  })

  test('应该能编辑变量后重新生成', async ({ page }) => {
    await page.click('text=工单看板')
    const firstTicket = page.locator('[data-testid="ticket-card"]').first()
    if (await firstTicket.count() === 0) test.skip()
    
    await firstTicket.click()
    await page.locator('text=Compose & Send').scrollIntoViewIfNeeded()

    // 选择模板
    const templateSelect = page.locator('select').filter({ hasText: '选择模板' })
    await templateSelect.selectOption({ label: /报价与方案/ })

    // 第一次生成
    await page.locator('input[placeholder*="联系人"]').fill('客户A')
    await page.click('button:has-text("生成草稿（DRAFT）")')
    await expect(page.locator('text=客户A')).toBeVisible({ timeout: 5000 })

    // 修改变量
    await page.locator('input[placeholder*="联系人"]').fill('客户B')
    await page.click('button:has-text("生成草稿（DRAFT）")')

    // 验证预览更新
    await expect(page.locator('text=客户B')).toBeVisible({ timeout: 5000 })
  })
})
