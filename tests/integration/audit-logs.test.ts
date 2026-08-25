/**
 * 审计日志（AuditLog）API 集成测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, DEFAULT_WORKSPACE_ID, generateTestTraceId } from './helpers'
import { clearHashChainCache, verifyAuditChain, writeAuditLogStrict } from '../../src/main/services/audit-log-writer'

describe('AuditLog API', () => {
  beforeAll(async () => {
    await testPrisma.$connect()
  })

  afterAll(async () => {
    await cleanupTestData()
    await testPrisma.$disconnect()
  })

  beforeEach(async () => {
    await cleanupTestData()
    clearHashChainCache()
  })

  describe('审计日志写入', () => {
    it('应该能够创建审计日志', async () => {
      const traceId = generateTestTraceId()
      
      const auditLog = await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId,
          actor: 'admin',
          action: 'USER_LOGIN',
          tool: 'auth',
          request: JSON.stringify({ method: 'token' }),
          response: JSON.stringify({ success: true }),
          currentHash: 'hash-' + traceId
        }
      })

      expect(auditLog.id).toBeDefined()
      expect(auditLog.traceId).toBe(traceId)
      expect(auditLog.action).toBe('USER_LOGIN')
    })

    it('审计日志应该包含敏感信息掩码', async () => {
      const traceId = generateTestTraceId()

      // 模拟敏感信息掩码
      const sensitiveRequest = {
        token: 'sk-****abcd',
        password: '****',
        apiKey: '****secret****'
      }

      const auditLog = await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId,
          actor: 'api-client',
          action: 'API_CALL',
          request: JSON.stringify(sensitiveRequest),
          response: JSON.stringify({ masked: true }),
          currentHash: 'hash-' + traceId
        }
      })

      const parsedRequest = JSON.parse(auditLog.request)
      expect(parsedRequest.token).toBe('sk-****abcd')
      expect(parsedRequest.password).toBe('****')
    })

    it('统一 writer 会递归脱敏并生成可验证链', async () => {
      const traceId = generateTestTraceId()
      await writeAuditLogStrict({
        workspaceId: DEFAULT_WORKSPACE_ID,
        traceId,
        actor: 'test',
        action: 'AUDIT_WRITER_TEST',
        request: { credentials: { token: 'sk-abcdefgh12345678', password: 'plain-secret' } },
        response: { authorization: 'Bearer top-secret-token' }
      })

      const row = await testPrisma.auditLog.findFirst({ where: { traceId } })
      expect(row).toBeDefined()
      expect(row!.request).not.toContain('plain-secret')
      expect(row!.request).toContain('***MASKED***')
      expect(row!.response).not.toContain('top-secret-token')

      const verification = await verifyAuditChain(DEFAULT_WORKSPACE_ID)
      expect(verification.valid).toBe(true)
    })

    it('同一工作区并发写入仍保持哈希链连续', async () => {
      await Promise.all(Array.from({ length: 8 }, (_, index) => writeAuditLogStrict({
        workspaceId: DEFAULT_WORKSPACE_ID,
        traceId: generateTestTraceId(),
        actor: 'test',
        action: `AUDIT_CONCURRENT_${index}`,
        request: { index },
        response: { success: true }
      })))

      const rows = await testPrisma.auditLog.findMany({
        where: { workspaceId: DEFAULT_WORKSPACE_ID, action: { startsWith: 'AUDIT_CONCURRENT_' } },
        orderBy: [{ ts: 'asc' }, { id: 'asc' }]
      })
      expect(rows).toHaveLength(8)
      for (let index = 1; index < rows.length; index += 1) {
        expect(rows[index].previousHash).toBe(rows[index - 1].currentHash)
      }
    })

    it('损坏或短 hash 会返回无效结果而不是抛异常', async () => {
      await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId: generateTestTraceId(),
          actor: 'test',
          action: 'BROKEN_HASH',
          request: '{}',
          response: '{}',
          previousHash: '',
          currentHash: 'short'
        }
      })

      const verification = await verifyAuditChain(DEFAULT_WORKSPACE_ID)
      expect(verification.valid).toBe(false)
      expect(verification.brokenChains.length).toBeGreaterThan(0)
    })

    it('应该能够关联工单创建审计日志', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '审计测试工单',
          source: 'api',
          status: 'INBOX',
          priority: 'MEDIUM',
          customerMeta: '{}'
        }
      })

      const traceId = generateTestTraceId()
      const auditLog = await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          ticketId: ticket.id,
          traceId,
          actor: 'system',
          action: 'TICKET_CREATED',
          request: JSON.stringify({ title: ticket.title }),
          response: JSON.stringify({ ticketId: ticket.id }),
          currentHash: 'hash-' + traceId
        }
      })

      expect(auditLog.ticketId).toBe(ticket.id)
    })
  })

  describe('审计日志查询', () => {
    beforeEach(async () => {
      // 创建测试审计日志
      const traceIds = [generateTestTraceId(), generateTestTraceId(), generateTestTraceId()]
      
      await testPrisma.auditLog.createMany({
        data: [
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            traceId: traceIds[0],
            actor: 'admin',
            action: 'CONFIG_CHANGED',
            request: '{}',
            response: '{}',
            currentHash: 'hash-1'
          },
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            traceId: traceIds[1],
            actor: 'user1',
            action: 'TICKET_UPDATED',
            request: '{}',
            response: '{}',
            currentHash: 'hash-2'
          },
          {
            workspaceId: DEFAULT_WORKSPACE_ID,
            traceId: traceIds[2],
            actor: 'user2',
            action: 'MESSAGE_SENT',
            request: '{}',
            response: '{}',
            currentHash: 'hash-3'
          }
        ]
      })
    })

    it('应该能够按 actor 查询审计日志', async () => {
      const adminLogs = await testPrisma.auditLog.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          actor: 'admin'
        }
      })

      expect(adminLogs.length).toBe(1)
      expect(adminLogs[0].actor).toBe('admin')
    })

    it('应该能够按 action 查询审计日志', async () => {
      const ticketLogs = await testPrisma.auditLog.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          action: 'TICKET_UPDATED'
        }
      })

      expect(ticketLogs.length).toBe(1)
      expect(ticketLogs[0].action).toBe('TICKET_UPDATED')
    })

    it('应该能够按 traceId 查询审计日志', async () => {
      const traceId = generateTestTraceId()
      
      await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId,
          actor: 'test',
          action: 'TRACE_TEST',
          request: '{}',
          response: '{}',
          currentHash: 'hash-trace'
        }
      })

      const logs = await testPrisma.auditLog.findMany({
        where: { traceId }
      })

      expect(logs.length).toBe(1)
      expect(logs[0].traceId).toBe(traceId)
    })

    it('应该能够按时间范围查询审计日志', async () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      
      const recentLogs = await testPrisma.auditLog.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          ts: {
            gte: oneHourAgo,
            lte: now
          }
        },
        orderBy: { ts: 'desc' }
      })

      expect(recentLogs.length).toBeGreaterThan(0)
    })
  })

  describe('审计日志哈希链', () => {
    it('应该能够构建哈希链', async () => {
      const logs = []
      let previousHash = 'genesis'

      for (let i = 0; i < 3; i++) {
        const traceId = generateTestTraceId()
        const contentHash = `content-hash-${i}`
        
        const log = await testPrisma.auditLog.create({
          data: {
            workspaceId: DEFAULT_WORKSPACE_ID,
            traceId,
            actor: 'chain-tester',
            action: `CHAIN_STEP_${i}`,
            request: '{}',
            response: '{}',
            previousHash,
            currentHash: contentHash
          }
        })

        logs.push(log)
        previousHash = contentHash
      }

      // 验证哈希链连续性
      expect(logs[0].previousHash).toBe('genesis')
      expect(logs[1].previousHash).toBe(logs[0].currentHash)
      expect(logs[2].previousHash).toBe(logs[1].currentHash)
    })
  })

  describe('审计日志与变更单', () => {
    it('应该能够关联变更单创建审计日志', async () => {
      const changeRequest = await testPrisma.changeRequest.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          type: 'CONFIG',
          title: '测试变更单',
          description: '测试描述',
          diffJson: '{}',
          status: 'DRAFT',
          traceId: generateTestTraceId(),
          createdBy: 'test'
        }
      })

      const auditLog = await testPrisma.auditLog.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          traceId: changeRequest.traceId,
          actor: 'test',
          action: 'CHANGE_REQUEST_CREATED',
          changeRequestId: changeRequest.id,
          request: JSON.stringify({ title: changeRequest.title }),
          response: JSON.stringify({ id: changeRequest.id }),
          currentHash: 'hash-cr'
        }
      })

      expect(auditLog.changeRequestId).toBe(changeRequest.id)
    })
  })
})
