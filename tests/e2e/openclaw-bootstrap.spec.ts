import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { closeElectronApp, launchElectronApp, waitForDashboardReady } from './helpers/electron'
import { apiJson } from './helpers/api'

const prisma = new PrismaClient()

interface BootstrapCleanupInput {
  targetId?: string
  targetName: string
  profileName: string
}

async function cleanupE2eBootstrapData(input: BootstrapCleanupInput): Promise<void> {
  const targets = await prisma.deploymentTarget.findMany({
    where: input.targetId ? { id: input.targetId } : { name: input.targetName },
    select: { id: true }
  })
  const targetIds = targets.map(target => target.id)
  const agentNamePrefix = `${input.profileName} ·`

  await prisma.$transaction(async tx => {
    if (targetIds.length > 0) {
      await tx.agentRegistration.deleteMany({ where: { targetId: { in: targetIds } } })
      await tx.deploymentJob.deleteMany({ where: { targetId: { in: targetIds } } })
      await tx.deploymentTarget.deleteMany({ where: { id: { in: targetIds } } })
    }

    await tx.agentTool.deleteMany({
      where: {
        agent: {
          name: {
            startsWith: agentNamePrefix
          }
        }
      }
    })
    await tx.agent.deleteMany({ where: { name: { startsWith: agentNamePrefix } } })
    await tx.connectionProfile.deleteMany({ where: { name: input.profileName } })
  })
}

test.afterAll(async () => {
  await prisma.$disconnect()
})

test.describe('OpenClaw 一键部署引导', () => {
  test('可生成部署目标、连接配置与 bootstrap 命令', async ({}, testInfo) => {
    const context = await launchElectronApp(testInfo)
    const suffix = Date.now()
    const targetName = `E2E Bootstrap ${suffix}`
    const profileName = `${targetName} OpenClaw`
    let createdTargetId: string | undefined

    try {
      await waitForDashboardReady(context.page)

      const result = await apiJson<{
        success: boolean
        data?: {
          target: { id: string; name: string; gatewayUrl: string | null }
          profile: { id: string; name: string; baseUrl: string }
          bootstrap: { registrationId: string; installCommand: string; bootstrapToken?: string }
          hired: Array<{ agentName: string }>
        }
        error?: string
      }>(context.page, '/api/openclaw/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: '00000000-0000-0000-0000-000000000001',
          name: targetName,
          targetType: 'REMOTE_DOCKER',
          host: '10.10.10.10',
          sshUser: 'root',
          sshPort: 22,
          gatewayPort: 18789,
          envType: 'DEV',
          autoHireTemplate: 'support-pod'
        })
      })

      expect(result.success).toBe(true)
      createdTargetId = result.data?.target.id
      expect(result.data?.target.name).toContain(targetName)
      expect(result.data?.profile.name).toContain('OpenClaw')
      expect(result.data?.profile.baseUrl).toContain('10.10.10.10:18789')
      expect(result.data?.bootstrap.installCommand).toContain('SOLOFORGE_BOOTSTRAP_TOKEN')
      expect(result.data?.hired.length || 0).toBeGreaterThan(0)

      const installJob = await apiJson<{
        success: boolean
        data?: { jobId: string; status: string; targetId: string; dispatchedActionId?: string | null }
        error?: string
      }>(context.page, '/api/openclaw/bootstrap/install-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: result.data?.target.id,
          profileId: result.data?.profile.id,
          registrationId: result.data?.bootstrap.registrationId
        })
      })

      expect(installJob.success).toBe(true)
      expect(installJob.data?.jobId).toBeTruthy()
      expect(['PENDING', 'RUNNING']).toContain(installJob.data?.status)
      if (installJob.data?.status === 'RUNNING') {
        expect(installJob.data?.dispatchedActionId).toBeTruthy()
      }

      await expect.poll(async () => {
        const job = await apiJson<{ status?: string }>(context.page, `/api/deployment-jobs/${installJob.data?.jobId}`)
        return job.status || 'UNKNOWN'
      }, { timeout: 10000 }).toMatch(/^(PENDING|RUNNING)$/)

      await context.page.getByTestId('sidebar-link-deployments').click()
      await expect(context.page.getByRole('heading', { name: '部署管理' })).toBeVisible()
      await expect(context.page.getByText(targetName).first()).toBeVisible()
    } finally {
      await cleanupE2eBootstrapData({ targetId: createdTargetId, targetName, profileName }).catch(error => {
        console.warn('清理 OpenClaw bootstrap E2E 测试数据失败:', error)
      })
      await closeElectronApp(context)
    }
  })
})
