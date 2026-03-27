import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('旧业务模块稳定冒烟', () => {
  test('审批中心可打开并展示筛选标签或空状态', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-approvals').click({ force: true })
      await expect(context.page).toHaveURL(/#\/approvals/)
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()
      await expect(context.page.getByRole('button', { name: /待审批/ })).toBeVisible()
      const emptyState = context.page.getByText('暂无审批记录')
      if (await emptyState.count() > 0) {
        await expect(emptyState.first()).toBeVisible()
      } else {
        await expect(context.page.getByText('请求内容:').first()).toBeVisible()
      }
    } finally {
      await closeElectronApp(context)
    }
  })

  test('联系人页可打开并展示新增表单与列表区块', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-contacts').click()
      await expect(context.page).toHaveURL(/#\/contacts/)
      await expect(context.page.getByRole('heading', { name: '联系人管理' })).toBeVisible()
      await expect(context.page.getByPlaceholder('联系人姓名')).toBeVisible()
      await expect(context.page.getByRole('button', { name: '创建联系人' })).toBeVisible()
      await expect(context.page.getByText('联系人列表')).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })

  test('外发消息中心可打开并展示状态分组', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-outbound-messages').click()
      await expect(context.page).toHaveURL(/#\/outbound-messages/)
      await expect(context.page.getByRole('heading', { name: 'Outbound Message Center' })).toBeVisible()
      await expect(context.page.getByRole('button', { name: '全部' })).toBeVisible()
      await expect(context.page.getByText(/草稿 \(/)).toBeVisible()
      await expect(context.page.getByText(/待审批 \(/)).toBeVisible()
      await expect(context.page.getByText(/已发送 \(/)).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})
