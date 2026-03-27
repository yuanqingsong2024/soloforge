import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

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

      const result = await context.page.evaluate(async (payload) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const profileResponse = await fetch(`http://127.0.0.1:${port}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.profileName,
            baseUrl: payload.baseUrl,
            wsUrl: payload.wsUrl,
            authMode: payload.authMode,
            token: payload.token || undefined,
            password: payload.password || undefined,
            edgeToken: payload.edgeToken || undefined
          })
        })
        const openclawProfile = await profileResponse.json() as { id: string }

        const commsProfileResponse = await fetch(`http://127.0.0.1:${port}/api/comms/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${payload.profileName}-comms`,
            provider: 'openclaw',
            openclawProfileId: openclawProfile.id,
            enabled: true
          })
        })
        const commsProfile = await commsProfileResponse.json() as { id: string }

        const targetResponse = await fetch(`http://127.0.0.1:${port}/api/comms/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commsProfileId: commsProfile.id,
            channel: payload.channel,
            to: payload.to,
            displayName: payload.targetDisplay,
            allowlisted: false
          })
        })
        const targetResult = await targetResponse.json() as { target: { id: string } }

        await fetch(`http://127.0.0.1:${port}/api/comms/targets/${targetResult.target.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowlisted: true })
        })

        const draftResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: payload.channel,
            to: payload.to,
            subject: 'E2E Live Delivery',
            body: '这是一条来自 SoloForge E2E 的真实外发集成测试消息。',
            status: 'APPROVED'
          })
        })
        const draft = await draftResponse.json() as { id: string }

        const sendResponse = await fetch(`http://127.0.0.1:${port}/api/outbound-messages/${draft.id}/send`, {
          method: 'POST'
        })
        if (!sendResponse.ok) {
          const text = await sendResponse.text()
          throw new Error(`真实外发发送失败: ${text}`)
        }

        return { outboundMessageId: draft.id }
      }, {
        profileName,
        targetDisplay,
        baseUrl: LIVE_BASE_URL,
        wsUrl: LIVE_WS_URL,
        authMode: LIVE_AUTH_MODE,
        token: LIVE_TOKEN,
        password: LIVE_PASSWORD,
        edgeToken: LIVE_EDGE_TOKEN,
        channel: LIVE_CHANNEL,
        to: LIVE_TARGET
      })

      await expect.poll(async () => {
        return await context.page.evaluate(async (outboundMessageId) => {
          const params = new URLSearchParams(window.location.search)
          const portValue = params.get('apiPort')
          if (!portValue) return false
          const port = Number(portValue)
          if (!Number.isFinite(port)) return false

          const response = await fetch(`http://127.0.0.1:${port}/api/outbound-messages`)
          const rows = await response.json() as Array<{ id: string; status: string; providerMessageId?: string | null }>
          return rows.some(row => row.id === outboundMessageId && row.status === 'SENT')
        }, result.outboundMessageId)
      }, { timeout: 20000 }).toBe(true)
    } finally {
      await closeElectronApp(context)
    }
  })
})
