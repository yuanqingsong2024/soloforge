/**
 * Workspace 集成测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, initTestDatabase, createTestWorkspace, cleanupTestWorkspace, DEFAULT_WORKSPACE_ID } from './helpers'

describe('Workspace API', () => {
  beforeAll(async () => {
    await initTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestData()
    await testPrisma.$disconnect()
  })

  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Workspace 创建', () => {
    it('应该能够创建设开发环境 Workspace', async () => {
      const uniqueName = `dev-ws-${Date.now()}`
      const workspace = await testPrisma.workspace.create({
        data: {
          name: uniqueName,
          description: '开发环境',
          envType: 'DEV',
          setupCompleted: false
        }
      })

      expect(workspace.id).toBeDefined()
      expect(workspace.name).toBe(uniqueName)
      expect(workspace.envType).toBe('DEV')
      expect(workspace.setupCompleted).toBe(false)
    })

    it('应该能够创建生产环境 Workspace', async () => {
      const uniqueName = `prod-ws-${Date.now()}`
      const workspace = await testPrisma.workspace.create({
        data: {
          name: uniqueName,
          description: '生产环境',
          envType: 'PROD',
          isReadOnlyDefault: true
        }
      })

      expect(workspace.envType).toBe('PROD')
      expect(workspace.isReadOnlyDefault).toBe(true)
    })

    it('应该支持临时解锁', async () => {
      const uniqueName = `unlock-ws-${Date.now()}`
      const prodWorkspace = await testPrisma.workspace.create({
        data: {
          name: uniqueName,
          envType: 'PROD',
          isReadOnlyDefault: true
        }
      })

      const unlockUntil = new Date(Date.now() + 30 * 60 * 1000)

      const unlocked = await testPrisma.workspace.update({
        where: { id: prodWorkspace.id },
        data: { unlockUntil }
      })

      expect(unlocked.unlockUntil).toBeDefined()
      expect(unlocked.unlockUntil!.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('Workspace 隔离', () => {
    it('不同 Workspace 的数据应该隔离', async () => {
      const workspace1 = await createTestWorkspace('workspace-1')
      const workspace2 = await createTestWorkspace('workspace-2')

      // 在 workspace1 创建工单
      await testPrisma.ticket.create({
        data: {
          workspaceId: workspace1,
          title: 'Workspace 1 Ticket',
          source: 'api',
          status: 'INBOX',
          priority: 'HIGH',
          customerMeta: '{}'
        }
      })

      // 在 workspace2 创建工单
      await testPrisma.ticket.create({
        data: {
          workspaceId: workspace2,
          title: 'Workspace 2 Ticket',
          source: 'api',
          status: 'INBOX',
          priority: 'LOW',
          customerMeta: '{}'
        }
      })

      // 查询 workspace1 的工单
      const workspace1Tickets = await testPrisma.ticket.findMany({
        where: { workspaceId: workspace1 }
      })

      // 查询 workspace2 的工单
      const workspace2Tickets = await testPrisma.ticket.findMany({
        where: { workspaceId: workspace2 }
      })

      expect(workspace1Tickets).toHaveLength(1)
      expect(workspace1Tickets[0].title).toBe('Workspace 1 Ticket')
      expect(workspace2Tickets).toHaveLength(1)
      expect(workspace2Tickets[0].title).toBe('Workspace 2 Ticket')

      // 清理
      await cleanupTestWorkspace(workspace1)
      await cleanupTestWorkspace(workspace2)
    })
  })

  describe('Workspace 策略', () => {
    it('应该能够设置策略', async () => {
      const workspaceId = await createTestWorkspace('policy-ws')

      const policy = await testPrisma.workspacePolicy.create({
        data: {
          workspaceId,
          policyJson: JSON.stringify({
            tools_policy: { allow: ['read_file'], deny: ['execute_command'] },
            comms_policy: { allowed_targets: [] }
          })
        }
      })

      expect(policy.workspaceId).toBe(workspaceId)
      expect(policy.policyJson).toContain('tools_policy')

      // 清理
      await cleanupTestWorkspace(workspaceId)
    })

    it('应该能够查询策略', async () => {
      const workspaceId = await createTestWorkspace('policy-query-ws')

      await testPrisma.workspacePolicy.create({
        data: {
          workspaceId,
          policyJson: JSON.stringify({
            tools_policy: { allow: ['read_file'], deny: ['execute_command'] }
          })
        }
      })

      const policies = await testPrisma.workspacePolicy.findMany({
        where: { workspaceId }
      })

      expect(policies).toHaveLength(1)

      // 清理
      await cleanupTestWorkspace(workspaceId)
    })
  })
})
