import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

const LIVE_BASE_URL = process.env.SOLOFORGE_LIVE_OPENCLAW_BASE_URL || ''
const LIVE_WS_URL = process.env.SOLOFORGE_LIVE_OPENCLAW_WS_URL || ''
const LIVE_AUTH_MODE = (process.env.SOLOFORGE_LIVE_OPENCLAW_AUTH_MODE || 'token') as 'token' | 'password' | 'trusted-proxy'
const LIVE_TOKEN = process.env.SOLOFORGE_LIVE_OPENCLAW_TOKEN || ''
const LIVE_PASSWORD = process.env.SOLOFORGE_LIVE_OPENCLAW_PASSWORD || ''
const LIVE_EDGE_TOKEN = process.env.SOLOFORGE_LIVE_OPENCLAW_EDGE_TOKEN || ''
const LIVE_CHANNEL = process.env.SOLOFORGE_LIVE_CHANNEL || 'slack'
const LIVE_TARGET = process.env.SOLOFORGE_LIVE_TARGET || ''

const hasLiveConfig = Boolean(LIVE_BASE_URL && LIVE_WS_URL && LIVE_TARGET)

test.describe('真实 OpenClaw 外发集成', () => {
  test.skip(!hasLiveConfig, '未提供真实 OpenClaw 集成测试环境变量，跳过 live delivery 测试')

  test('可通过真实 OpenClaw 完成外发发送', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const profileName = `E2E-Live-Profile-${Date.now()}`
    const targetDisplay = `E2E-Live-Target-${Date.now()}`

    try {
      await waitForDashboardReady(context.page)

      const openclawProfile = await apiJson<{ id: string }>(context.page, '/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          baseUrl: LIVE_BASE_URL,
          wsUrl: LIVE_WS_URL,
          authMode: LIVE_AUTH_MODE,
          token: LIVE_TOKEN || undefined,
          password: LIVE_PASSWORD || undefined,
          edgeToken: LIVE_EDGE_TOKEN || undefined
        })
      })

      const commsProfile = await apiJson<{ id: string }>(context.page, '/api/comms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${profileName}-comms`,
          provider: 'openclaw',
          openclawProfileId: openclawProfile.id,
          enabled: true
        })
      })

      const targetResult = await apiJson<{ target: { id: string } }>(context.page, '/api/comms/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commsProfileId: commsProfile.id,
          channel: LIVE_CHANNEL,
          to: LIVE_TARGET,
          displayName: targetDisplay,
          allowlisted: false
        })
      })

      await apiJson(context.page, `/api/comms/targets/${targetResult.target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowlisted: true })
      })

      const draft = await apiJson<{ id: string }>(context.page, '/api/outbound-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: LIVE_CHANNEL,
          to: LIVE_TARGET,
          subject: 'E2E Live Delivery',
          body: '这是一条来自 SoloForge E2E 的真实外发集成测试消息。',
          status: 'APPROVED'
        })
      })

      const sendResponse = await apiJson<{ status?: string }>(context.page, `/api/outbound-messages/${draft.id}/send`, {
        method: 'POST'
      })

      expect(sendResponse.status).toBeTruthy()

      await expect.poll(async () => {
        const rows = await apiJson<Array<{ id: string; status: string }>>(context.page, '/api/outbound-messages')
        return rows.some(row => row.id === draft.id && row.status === 'SENT')
      }, { timeout: 20000 }).toBe(true)
    } finally {
      await closeElectronApp(context)
    }
  })
})
