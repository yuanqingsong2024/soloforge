/**
 * 审批（Approvals）API 集成测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, DEFAULT_WORKSPACE_ID, generateTestTraceId } from './helpers'

describe('Approvals API', () => {
  beforeAll(async () => {
    await testPrisma.$connect()
  })

  afterAll(async () => {
    await cleanupTestData()
    await testPrisma.$disconnect()
  })

  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('创建审批', () => {
    it('应该能够创建 SEND_EXTERNAL 审批', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '测试工单',
          source: 'api',
          status: 'INBOX',
          priority: 'MEDIUM',
          customerMeta: '{}'
        }
      })

      const approval = await testPrisma.approval.create({
        data: {
          ticketId: ticket.id,
          actionType: 'SEND_EXTERNAL',
          payload: JSON.stringify({
            to: 'customer@example.com',
            subject: '测试邮件',
            channel: 'email'
          }),
          status: 'PENDING',
          requestedBy: 'system'
        }
      })

      expect(approval.id).toBeDefined()
      expect(approval.actionType).toBe('SEND_EXTERNAL')
      expect(approval.status).toBe('PENDING')
    })

    it('应该能够创建 DEPLOY_PROD 审批', async () => {
      const approval = await testPrisma.approval.create({
        data: {
          actionType: 'DEPLOY_PROD',
          payload: JSON.stringify({
            targetId: 'prod-server-1',
            version: '1.2.0'
          }),
          status: 'PENDING',
          requestedBy: 'deploy-bot'
        }
      })

      expect(approval.actionType).toBe('DEPLOY_PROD')
      expect(approval.status).toBe('PENDING')
    })

    it('应该能够创建 CHANGE_CONFIG 审批', async () => {
      const approval = await testPrisma.approval.create({
        data: {
          actionType: 'CHANGE_CONFIG',
          payload: JSON.stringify({
            path: 'gateway.auth.mode',
            before: 'token',
            after: 'trusted-proxy'
          }),
          status: 'PENDING',
          requestedBy: 'config-manager'
        }
      })

      expect(approval.actionType).toBe('CHANGE_CONFIG')
    })
  })

  describe('审批流程', () => {
    let approvalId: string

    beforeEach(async () => {
      const approval = await testPrisma.approval.create({
        data: {
          actionType: 'SEND_EXTERNAL',
          payload: JSON.stringify({ to: 'test@example.com' }),
          status: 'PENDING',
          requestedBy: 'test-user'
        }
      })
      approvalId = approval.id
    })

    it('应该能够批准审批', async () => {
      const approved = await testPrisma.approval.update({
        where: { id: approvalId },
        data: {
          status: 'APPROVED',
          approvedBy: 'admin',
          decidedAt: new Date()
        }
      })

      expect(approved.status).toBe('APPROVED')
      expect(approved.approvedBy).toBe('admin')
      expect(approved.decidedAt).toBeDefined()
    })

    it('应该能够拒绝审批', async () => {
      const rejected = await testPrisma.approval.update({
        where: { id: approvalId },
        data: {
          status: 'REJECTED',
          approvedBy: 'admin',
          decidedAt: new Date()
        }
      })

      expect(rejected.status).toBe('REJECTED')
    })

    it('应该能够查询待审批列表', async () => {
      const pendingApprovals = await testPrisma.approval.findMany({
        where: { status: 'PENDING' }
      })

      expect(pendingApprovals.length).toBeGreaterThan(0)
      expect(pendingApprovals.every(a => a.status === 'PENDING')).toBe(true)
    })
  })

  describe('审批与审计', () => {
    it('审批决策应该生成审计日志', async () => {
      const approval = await testPrisma.approval.create({
        data: {
          actionType: 'ROTATE_TOKEN',
          payload: JSON.stringify({ profileId: 'profile-1' }),
          status: 'PENDING',
          requestedBy: 'security-bot'
        }
      })

      // 批准
      await testPrisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'APPROVED',
          approvedBy: 'security-admin',
          decidedAt: new Date()
        }
      })

      // 创建审计日志
      const auditLog = await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId: generateTestTraceId(),
          actor: 'security-admin',
          action: 'APPROVAL_DECIDED',
          approvalId: approval.id,
          request: JSON.stringify({ actionType: 'ROTATE_TOKEN', decision: 'APPROVED' }),
          response: JSON.stringify({ success: true }),
          currentHash: 'test-hash'
        }
      })

      expect(auditLog.approvalId).toBe(approval.id)
      expect(auditLog.action).toBe('APPROVAL_DECIDED')
    })
  })

  describe('高危审批类型', () => {
    const highRiskActions = [
      'SEND_EXTERNAL',
      'MERGE_MAIN',
      'DEPLOY_PROD',
      'EXPORT_DATA',
      'PURCHASE',
      'CHANGE_CONFIG',
      'ROTATE_TOKEN'
    ]

    highRiskActions.forEach(actionType => {
      it(`应该支持 ${actionType} 审批类型`, async () => {
        const approval = await testPrisma.approval.create({
          data: {
            actionType,
            payload: JSON.stringify({ test: true }),
            status: 'PENDING',
            requestedBy: 'test'
          }
        })

        expect(approval.actionType).toBe(actionType)
      })
    })
  })
})
