import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('审批与外发中心稳定回归', () => {
  test('通过工单页面发起外发审批', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const outboundTo = `e2e-${Date.now()}-channel`
    const ticketTitle = `E2E工单-${Date.now()}`
    const maskedTo = maskTarget(outboundTo)

    try {
      await waitForDashboardReady(context.page)

      const ticketId = await context.page.evaluate(async ({ ticketTitle }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const ticketResponse = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
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
        const ticket = await ticketResponse.json() as { id: string }
        return ticket.id
      }, { ticketTitle })

      context.page.on('dialog', async dialog => {
        await dialog.accept()
      })

      await context.page.evaluate((id) => {
        window.location.hash = `#/tickets/${id}`
      }, ticketId)
      await expect(context.page).toHaveURL(new RegExp(`#\\/tickets\\/${ticketId}`))

      await context.page.getByText('Compose & Send').scrollIntoViewIfNeeded()
      await context.page.getByPlaceholder('收件人 / 频道 ID').fill(outboundTo)
      await context.page.getByPlaceholder('外发正文（支持 Markdown）').fill('E2E UI 触发审批测试')
      await context.page.getByRole('button', { name: '发送（创建审批）' }).click()

      await expect.poll(async () => {
        return await context.page.evaluate(async ({ maskedTo }) => {
          const params = new URLSearchParams(window.location.search)
          const portValue = params.get('apiPort')
          if (!portValue) return false
          const port = Number(portValue)
          if (!Number.isFinite(port)) return false
          const response = await fetch(`http://127.0.0.1:${port}/api/approvals?status=PENDING`)
          const approvals = await response.json() as Array<{ actionType: string; payload: string }>
          return approvals.some(item => item.actionType === 'SEND_EXTERNAL' && item.payload.includes(maskedTo))
        }, { maskedTo })
      }, { timeout: 10000 }).toBe(true)
    } finally {
      await closeElectronApp(context)
    }
  })

  test('创建外发审批后可在审批中心拒绝处理', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const outboundTo = `e2e-${Date.now()}-channel`

    try {
      await waitForDashboardReady(context.page)

      const approval = await context.page.evaluate(async ({ outboundTo }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const draftResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages`, {
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
        const draft = await draftResponse.json() as { id: string }

        const sendResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages/${draft.id}/send`, {
          method: 'POST'
        })
        const sendResult = await sendResponse.json() as { status: string; approvalId?: string }
        if (sendResult.status !== 'pending_approval' || !sendResult.approvalId) {
          throw new Error('未生成审批')
        }

        return { approvalId: sendResult.approvalId, outboundMessageId: draft.id }
      }, { outboundTo })

      await context.page.getByTestId('sidebar-link-approvals').click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      await expect(context.page.locator(`pre:has-text("${approval.outboundMessageId}")`).first()).toBeVisible({ timeout: 10000 })

      await context.page.evaluate(async (approvalId) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')
        await fetch(`http://127.0.0.1:${port}/api/approvals/${approvalId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'REJECTED', approvedBy: 'e2e' })
        })
      }, approval.approvalId)

      await expect.poll(async () => {
        return await context.page.evaluate(async (approvalId) => {
          const params = new URLSearchParams(window.location.search)
          const portValue = params.get('apiPort')
          if (!portValue) return false
          const port = Number(portValue)
          if (!Number.isFinite(port)) return false
          const response = await fetch(`http://127.0.0.1:${port}/api/approvals?status=REJECTED`)
          const approvals = await response.json() as Array<{ id: string }>
          return approvals.some(item => item.id === approvalId)
        }, approval.approvalId)
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

      const approval = await context.page.evaluate(async ({ outboundTo }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const draftResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages`, {
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
        const draft = await draftResponse.json() as { id: string }

        const sendResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages/${draft.id}/send`, {
          method: 'POST'
        })
        const sendResult = await sendResponse.json() as { status: string; approvalId?: string }
        if (sendResult.status !== 'pending_approval' || !sendResult.approvalId) {
          throw new Error('未生成审批')
        }

        return { approvalId: sendResult.approvalId, outboundMessageId: draft.id }
      }, { outboundTo })

      await context.page.getByTestId('sidebar-link-approvals').click()
      await expect(context.page).toHaveURL(/#\/approvals/)

      const approvalRow = context.page
        .locator(`pre:has-text("${approval.outboundMessageId}")`)
        .first()
        .locator('..')
        .locator('..')
        .locator('..')

      await expect(approvalRow).toBeVisible({ timeout: 10000 })
      await approvalRow.getByRole('button', { name: '批准', exact: true }).first().click()

      await expect.poll(async () => {
        return await context.page.evaluate(async ({ approvalId }) => {
          const params = new URLSearchParams(window.location.search)
          const portValue = params.get('apiPort')
          if (!portValue) return false
          const port = Number(portValue)
          if (!Number.isFinite(port)) return false

          const approvalResponse = await fetch(`http://127.0.0.1:${port}/api/approvals?status=APPROVED`)
          const approvals = await approvalResponse.json() as Array<{ id: string }>
          return approvals.some(item => item.id === approvalId)
        }, { approvalId: approval.approvalId })
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
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()

      await context.page.getByRole('button', { name: /待审批/ }).click()
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()

      await context.page.getByRole('button', { name: /已批准/ }).click()
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()

      await context.page.getByRole('button', { name: /已拒绝/ }).click()
      await expect(context.page.getByRole('heading', { name: '审批中心' })).toBeVisible()

      await context.page.getByRole('button', { name: /全部/ }).click()
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

  test('外发消息中心可切换状态筛选', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)
      await context.page.getByTestId('sidebar-link-outbound-messages').click()
      await expect(context.page).toHaveURL(/#\/outbound-messages/)
      await expect(context.page.getByRole('heading', { name: 'Outbound Message Center' })).toBeVisible()

      await context.page.getByRole('button', { name: 'DRAFT' }).click()
      await expect(context.page.getByText(/草稿 \(/)).toBeVisible()

      await context.page.getByRole('button', { name: 'PENDING_APPROVAL' }).click()
      await expect(context.page.getByText(/待审批 \(/)).toBeVisible()

      await context.page.getByRole('button', { name: 'SENT' }).click()
      await expect(context.page.getByText(/已发送 \(/)).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})

function maskTarget(raw: string): string {
  if (!raw) return '***'
  if (raw.length <= 4) return `${raw[0]}***`
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`
}
