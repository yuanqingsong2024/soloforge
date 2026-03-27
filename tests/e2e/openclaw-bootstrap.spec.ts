import { test, expect } from '@playwright/test'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'

test.describe('OpenClaw 一键部署引导', () => {
  test('可生成部署目标、连接配置与 bootstrap 命令', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const suffix = Date.now()

    try {
      await waitForDashboardReady(context.page)

      const result = await context.page.evaluate(async ({ suffix }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const response = await fetch(`http://127.0.0.1:${port}/api/openclaw/bootstrap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: '00000000-0000-0000-0000-000000000001',
            name: `E2E Bootstrap ${suffix}`,
            targetType: 'REMOTE_DOCKER',
            host: '10.10.10.10',
            sshUser: 'root',
            sshPort: 22,
            gatewayPort: 18789,
            envType: 'DEV',
            autoHireTemplate: 'support-pod'
          })
        })

        const payload = await response.json() as {
          success: boolean
          data?: {
            target: { id: string; name: string; gatewayUrl: string | null }
            profile: { id: string; name: string; baseUrl: string }
            bootstrap: { registrationId: string; installCommand: string; bootstrapToken?: string }
            hired: Array<{ agentName: string }>
          }
          error?: string
        }

        return {
          ok: response.ok,
          success: payload.success,
          targetId: payload.data?.target.id,
          targetName: payload.data?.target.name,
          profileId: payload.data?.profile.id,
          gatewayUrl: payload.data?.target.gatewayUrl,
          profileName: payload.data?.profile.name,
          baseUrl: payload.data?.profile.baseUrl,
          registrationId: payload.data?.bootstrap.registrationId,
          bootstrapToken: payload.data?.bootstrap.bootstrapToken,
          installCommand: payload.data?.bootstrap.installCommand,
          hiredCount: payload.data?.hired.length ?? 0,
          error: payload.error || null
        }
      }, { suffix })

      expect(result.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.targetName).toContain(`E2E Bootstrap ${suffix}`)
      expect(result.profileName).toContain('OpenClaw')
      expect(result.baseUrl).toContain('10.10.10.10:18789')
      expect(result.installCommand).toContain('SOLOFORGE_BOOTSTRAP_TOKEN')
      expect(result.hiredCount).toBeGreaterThan(0)

      const installJob = await context.page.evaluate(async ({ targetId, profileId, registrationId }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')

        const registerResponse = await fetch(`http://127.0.0.1:${port}/api/host-agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken: registrationId ? undefined : undefined
          })
        })

        void registerResponse

        const response = await fetch(`http://127.0.0.1:${port}/api/openclaw/bootstrap/install-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, profileId, registrationId })
        })
        const payload = await response.json() as {
          success: boolean
          data?: { jobId: string; status: string; targetId: string; dispatchedActionId?: string | null }
          error?: string
        }

        return {
          ok: response.ok,
          success: payload.success,
          jobId: payload.data?.jobId,
          status: payload.data?.status,
          dispatchedActionId: payload.data?.dispatchedActionId || null,
          error: payload.error || null
        }
      }, {
        targetId: result.targetId,
        profileId: result.profileId,
        registrationId: result.registrationId
      })

      const lifecycle = await context.page.evaluate(async ({ targetId, profileId, registrationId, bootstrapToken }) => {
        const params = new URLSearchParams(window.location.search)
        const portValue = params.get('apiPort')
        if (!portValue) throw new Error('无法获取 apiPort')
        const port = Number(portValue)
        if (!Number.isFinite(port)) throw new Error('apiPort 无效')
        if (!bootstrapToken) throw new Error('缺少 bootstrapToken')

        const registerResponse = await fetch(`http://127.0.0.1:${port}/api/host-agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapToken,
            name: `E2E Host Agent ${targetId}`,
            hostname: `e2e-host-${targetId}`,
            osType: 'linux',
            arch: 'x64',
            agentVersion: '0.1.0',
            capabilities: {
              docker_control: true,
              verify_health: true,
              detect_version: true,
              collect_logs: true,
              collect_state: true,
              doctor_checks: true
            },
            labels: { source: 'e2e' },
            lastSeenIp: '10.10.10.10'
          })
        })
        const registerPayload = await registerResponse.json() as { success?: boolean; data?: { hostAgentId: string; authToken: string } }
        const registerData = registerPayload.data
        if (!registerResponse.ok || !registerData?.hostAgentId || !registerData.authToken) {
          throw new Error('Host Agent 注册失败')
        }

        const installJobResponse = await fetch(`http://127.0.0.1:${port}/api/openclaw/bootstrap/install-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, profileId, registrationId })
        })
        const installJobPayload = await installJobResponse.json() as { success?: boolean; data?: { jobId: string; status: string; dispatchedActionId?: string | null } }
        const installJobData = installJobPayload.data
        if (!installJobResponse.ok || !installJobData?.jobId) {
          throw new Error('创建安装作业失败')
        }

        const pullResponse = await fetch(`http://127.0.0.1:${port}/api/host-agents/${registerData.hostAgentId}/pull`, {
          headers: { Authorization: `Bearer ${registerData.authToken}` }
        })
        const action = await pullResponse.json() as { success?: boolean; data?: { id: string; actionType: string } }
        if (!pullResponse.ok || !action.data?.id) {
          throw new Error('Host Agent 拉取动作失败')
        }

        await fetch(`http://127.0.0.1:${port}/api/host-agents/${registerData.hostAgentId}/actions/${action.data.id}/ack`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${registerData.authToken}` }
        })

        const completeResponse = await fetch(`http://127.0.0.1:${port}/api/host-agents/${registerData.hostAgentId}/actions/${action.data.id}/complete`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${registerData.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'SUCCEEDED',
            result: {
              deploymentJobId: installJobData.jobId,
              message: 'E2E simulated install completed'
            },
            logs: [
              {
                level: 'INFO',
                message: 'Simulated DOCKER_COMPOSE_UP completed',
                data: { deploymentJobId: installJobData.jobId }
              }
            ]
          })
        })
        if (!completeResponse.ok) {
          throw new Error('Host Agent 完成动作失败')
        }

        return {
          hostAgentId: registerData.hostAgentId,
          jobId: installJobData.jobId,
          actionId: action.data.id,
          initialStatus: installJobData.status,
          dispatchedActionId: installJobData.dispatchedActionId || null
        }
      }, {
        targetId: result.targetId,
        profileId: result.profileId,
        registrationId: result.registrationId,
        bootstrapToken: result.bootstrapToken
      })

      expect(lifecycle.jobId).toBeTruthy()
      expect(lifecycle.initialStatus).toBe('RUNNING')
      expect(lifecycle.dispatchedActionId).toBeTruthy()

      await expect.poll(async () => {
        return await context.page.evaluate(async (jobId) => {
          const params = new URLSearchParams(window.location.search)
          const portValue = params.get('apiPort')
          if (!portValue) return 'UNKNOWN'
          const port = Number(portValue)
          if (!Number.isFinite(port)) return 'UNKNOWN'
          const response = await fetch(`http://127.0.0.1:${port}/api/deployment-jobs/${jobId}`)
          const payload = await response.json() as { status?: string }
          return payload.status || 'UNKNOWN'
        }, lifecycle.jobId)
      }, { timeout: 10000 }).toBe('SUCCEEDED')

      await context.page.getByTestId('sidebar-link-deployments').click()
      await expect(context.page.getByRole('heading', { name: '部署管理' })).toBeVisible()
      await expect(context.page.getByText(`E2E Bootstrap ${suffix}`).first()).toBeVisible()
    } finally {
      await closeElectronApp(context)
    }
  })
})
