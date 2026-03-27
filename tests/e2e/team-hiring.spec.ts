import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('一键招聘员工', () => {
  test('可基于 Connection Profile 执行模板化招聘', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)

      const result = await context.page.evaluate(async () => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const profiles = await fetch(`http://127.0.0.1:${port}/api/profiles`).then(r => r.json()) as Array<{ id: string; name: string }>
        if (profiles.length === 0) {
          return { skipped: true, reason: '没有可用的 Connection Profile' }
        }

        const hireResponse = await fetch(`http://127.0.0.1:${port}/api/team/hire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profiles[0].id, template: 'support-pod' })
        })
        const payload = await hireResponse.json() as { success: boolean; data?: { hired: Array<{ agentName: string }> }; error?: string }

        return {
          skipped: false,
          ok: hireResponse.ok,
          success: payload.success,
          hiredNames: payload.data?.hired.map(item => item.agentName) || [],
          error: payload.error || null
        }
      })

      test.skip(Boolean(result.skipped), result.skipped ? result.reason : undefined)

      if (result.skipped || !result.hiredNames) {
        throw new Error(result.skipped ? result.reason : '招聘结果缺少 hiredNames')
      }

      expect(result.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.hiredNames.length).toBeGreaterThan(0)

      await context.page.getByTestId('sidebar-link-team').click()
      await expect(context.page.getByRole('heading', { name: '团队管理' })).toBeVisible()
      await expect(context.page.getByText(result.hiredNames[0]).first()).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})
