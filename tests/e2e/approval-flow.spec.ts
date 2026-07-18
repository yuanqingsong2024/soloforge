import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

test.describe('审批与外发中心稳定回归', () => {
  test('通过工单页面发起外发审批', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const outboundTo = `e2e-${Date.now()}-channel`
    const ticketTitle = `E2E工单-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)

      const ticket = await apiJson<{ id: string }>(context.page, '/api/tickets', {
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

      context.page.on('dialog', async dialog => {
        await dialog.accept()
      })

      await context.page.evaluate((id) => {
        window.location.hash = `#/tickets/${id}`
      }, ticket.id)
      await expect(context.page).toHaveURL(new RegExp(`#\/tickets\/${ticket.id}`))

      await context.page.getByText('Compose & Send').scrollIntoViewIfNeeded()
      await context.page.getByTestId('ticket-outbound-to-input').fill(outboundTo)
      await context.page.getByTestId('ticket-outbound-body-input').fill('E2E UI 触发审批测试')
      await context.page.getByTestId('ticket-send-outbound').click()

      await expect.poll(async () => {
        const approvals = await apiJson<Array<{ id: string; status: string; actionType: string }>>(context.page, '/api/approvals?status=PENDING')
        return approvals.some(item => item.status === 'PENDING' && item.actionType === 'SEND_EXTERNAL')
      }, { timeout: 10000 }).toBe(true)
      await expect(context.page.getByTestId('ticket-approvals-panel')).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })

  test('创建外发审批后可在审批中心拒绝处理', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const outboundTo = `e2e-${Date.now()}-channel`

    try {
      await waitForDashboardReady(context.page)
      context.page.on('dialog', async dialog => {
        await dialog.accept()
      })

      const draft = await apiJson<{ id: string }>(context.page, '/api/outbound-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'slack',
          to: outboundTo,
          subject: 'E2E审批测试',
          body: 'E2E 外发消息测试',
          status: 'DRAFT'
        })
      })

      const sendResult = await apiJson<{ status: string; approvalId?: string }>(context.page, `/api/outbound-messages/${draft.id}/send`, {
        method: 'POST'
      })
      if (sendResult.status !== 'pending_approval' || !sendResult.approvalId) {
        throw new Error('未生成审批')
      }

      await context.page.getByTestId('sidebar-link-approvals').click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      const approvalCard = context.page.getByTestId(`approval-card-${sendResult.approvalId}`)
      await expect(approvalCard).toBeVisible({ timeout: 10000 })
      await approvalCard.getByTestId(`approval-reject-${sendResult.approvalId}`).click()

      await expect.poll(async () => {
        const approvals = await apiJson<Array<{ id: string; status: string }>>(context.page, '/api/approvals?status=REJECTED')
        return approvals.some(item => item.id === sendResult.approvalId)
      }, { timeout: 10000 }).toBe(true)
    } finally {
      await closeElectronApp(context)
    }
  })

  test('创建外发审批后可在审批中心通过处理', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const outboundTo = `e2e-${Date.now()}-approve`

    try {
      await waitForDashboardReady(context.page)
      context.page.on('dialog', async dialog => {
        await dialog.accept()
      })

      const draft = await apiJson<{ id: string }>(context.page, '/api/outbound-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'slack',
          to: outboundTo,
          subject: 'E2E审批通过测试',
          body: 'E2E 审批通过测试消息',
          status: 'DRAFT'
        })
      })

      const sendResult = await apiJson<{ status: string; approvalId?: string }>(context.page, `/api/outbound-messages/${draft.id}/send`, {
        method: 'POST'
      })
      if (sendResult.status !== 'pending_approval' || !sendResult.approvalId) {
        throw new Error('未生成审批')
      }

      await context.page.getByTestId('sidebar-link-approvals').click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      const approvalCard = context.page.getByTestId(`approval-card-${sendResult.approvalId}`)
      await expect(approvalCard).toBeVisible({ timeout: 10000 })
      await approvalCard.getByTestId(`approval-approve-${sendResult.approvalId}`).click()

      await expect.poll(async () => {
        const approvals = await apiJson<Array<{ id: string; status: string }>>(context.page, '/api/approvals?status=APPROVED')
        return approvals.some(item => item.id === sendResult.approvalId)
      }, { timeout: 10000 }).toBe(true)
    } finally {
      await closeElectronApp(context)
    }
  })

  test('审批中心可切换筛选标签并保持页面稳定', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-approvals').click()
      await expect(context.page).toHaveURL(/#\/approvals/)
      const approvalCards = context.page.locator('[data-testid^="approval-card-"]')
      const emptyState = context.page.getByTestId('approval-empty-state')
      await expect(emptyState.or(approvalCards.first())).toBeVisible()

      await context.page.getByRole('button', { name: /待审批/ }).click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      await context.page.getByRole('button', { name: /已通过/ }).click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      await context.page.getByRole('button', { name: /已拒绝/ }).click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      await context.page.getByRole('button', { name: /全部/ }).click()
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })

  test('外发消息中心可切换状态筛选', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-outbound-messages').click()
      await expect(context.page).toHaveURL(/#\/outbound-messages/)
      await expect(context.page.getByTestId('outbound-message-filters')).toBeVisible()

      await context.page.getByRole('button', { name: '草稿' }).click()
      await expect(context.page.getByTestId('outbound-message-section-DRAFT')).toBeVisible()

      await context.page.getByRole('button', { name: '待审批' }).click()
      await expect(context.page.getByTestId('outbound-message-section-PENDING_APPROVAL')).toBeVisible()

      await context.page.getByRole('button', { name: '已发送' }).click()
      await expect(context.page.getByTestId('outbound-message-section-SENT')).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})
