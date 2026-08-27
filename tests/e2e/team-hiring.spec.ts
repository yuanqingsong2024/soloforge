import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

test.describe('一键招聘员工', () => {
  test('可基于 Connection Profile 执行模板化招聘', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)

    try {
      await waitForDashboardReady(context.page)

      const profiles = await apiJson<Array<{ id: string; name: string }>>(context.page, '/api/profiles')
      expect(profiles.length).toBeGreaterThan(0)

      const payload = await apiJson<{ success: boolean; data?: { hired: Array<{ agentName: string }> }; error?: string }>(context.page, '/api/team/hire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profiles[0].id, template: 'support-pod' })
      })

      expect(payload.success).toBe(true)
      expect(payload.data?.hired.length || 0).toBeGreaterThan(0)

      await context.page.getByTestId('sidebar-link-team').click()
      await expect(context.page.getByRole('heading', { name: '团队管理' })).toBeVisible()
      await expect(context.page.getByText(payload.data?.hired[0].agentName || '').first()).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})
