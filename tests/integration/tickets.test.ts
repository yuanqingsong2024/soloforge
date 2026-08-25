/**
 * 工单（Tickets）API 集成测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, initTestDatabase, DEFAULT_WORKSPACE_ID, generateTestTraceId } from './helpers'

describe('Tickets API', () => {
  beforeAll(async () => {
    // 初始化测试数据库
    await initTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestData()
    await testPrisma.$disconnect()
  })

  beforeEach(async () => {
    // 每个测试前清理数据
    await cleanupTestData()
  })

  describe('创建工单', () => {
    it('应该能够创建基本工单', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '测试工单',
          source: 'email',
          status: 'INBOX',
          priority: 'MEDIUM',
          customerMeta: JSON.stringify({ email: 'test@example.com' })
        }
      })

      expect(ticket.id).toBeDefined()
      expect(ticket.title).toBe('测试工单')
      expect(ticket.status).toBe('INBOX')
      expect(ticket.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
    })

    it('应该能够创建带有联系人的工单', async () => {
      // 创建联系人
      const contact = await testPrisma.contact.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          name: '测试客户',
          company: '测试公司',
          tags: JSON.stringify(['VIP'])
        }
      })

      // 创建工单并关联联系人
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '客户工单',
          source: 'web',
          status: 'INBOX',
          priority: 'HIGH',
          contactId: contact.id,
          customerMeta: JSON.stringify({ source: 'website' })
        }
      })

      expect(ticket.contactId).toBe(contact.id)
    })

    it('应该支持工单状态流转', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '状态流转测试',
          source: 'api',
          status: 'INBOX',
          priority: 'LOW',
          customerMeta: '{}'
        }
      })

      // 流转到 SPEC
      const updated = await testPrisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'SPEC' }
      })

      expect(updated.status).toBe('SPEC')

      // 流转到 DEV
      const devUpdated = await testPrisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'DEV' }
      })

      expect(devUpdated.status).toBe('DEV')
    })
  })

  describe('查询工单', () => {
    beforeEach(async () => {
      // 创建测试工单
      const statuses = ['INBOX', 'SPEC', 'DEV', 'TEST', 'DELIVERY', 'DONE']
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

      for (let i = 0; i < 10; i++) {
        await testPrisma.ticket.create({
          data: {
            workspaceId: DEFAULT_WORKSPACE_ID,
            title: `工单 ${i}`,
            source: 'test',
            status: statuses[i % statuses.length],
            priority: priorities[i % priorities.length],
            customerMeta: '{}'
          }
        })
      }
    })

    it('应该能够按状态查询工单', async () => {
      const inboxTickets = await testPrisma.ticket.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          status: 'INBOX'
        }
      })

      expect(inboxTickets.length).toBeGreaterThan(0)
      expect(inboxTickets.every(t => t.status === 'INBOX')).toBe(true)
    })

    it('应该能够按优先级查询工单', async () => {
      const urgentTickets = await testPrisma.ticket.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          priority: 'URGENT'
        }
      })

      expect(urgentTickets.length).toBeGreaterThan(0)
      expect(urgentTickets.every(t => t.priority === 'URGENT')).toBe(true)
    })

    it('应该能够获取工单列表并按创建时间排序', async () => {
      const tickets = await testPrisma.ticket.findMany({
        where: { workspaceId: DEFAULT_WORKSPACE_ID },
        orderBy: { createdAt: 'desc' },
        take: 5
      })

      expect(tickets.length).toBeLessThanOrEqual(5)
    })
  })

  describe('工单与交付物', () => {
    it('应该能够为工单添加交付物', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '带交付物的工单',
          source: 'api',
          status: 'DEV',
          priority: 'HIGH',
          customerMeta: '{}'
        }
      })

      const artifact = await testPrisma.artifact.create({
        data: {
          ticketId: ticket.id,
          type: 'CODE_CHANGE',
          content: '# 代码变更\n\n这是变更内容',
          version: 1
        }
      })

      expect(artifact.ticketId).toBe(ticket.id)
      expect(artifact.type).toBe('CODE_CHANGE')
    })

    it('应该能够获取工单的所有交付物', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '多交付物工单',
          source: 'api',
          status: 'TEST',
          priority: 'MEDIUM',
          customerMeta: '{}'
        }
      })

      // 创建多个交付物
      await testPrisma.artifact.createMany({
        data: [
          { ticketId: ticket.id, type: 'PRD', content: '# PRD', version: 1 },
          { ticketId: ticket.id, type: 'PLAN', content: '# Plan', version: 1 },
          { ticketId: ticket.id, type: 'TEST_CASES', content: '# Test Cases', version: 1 }
        ]
      })

      const artifacts = await testPrisma.artifact.findMany({
        where: { ticketId: ticket.id }
      })

      expect(artifacts.length).toBe(3)
    })
  })

  describe('工单与标签', () => {
    it('应该能够为工单添加标签', async () => {
      const ticket = await testPrisma.ticket.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          title: '带标签的工单',
          source: 'api',
          status: 'INBOX',
          priority: 'LOW',
          customerMeta: '{}'
        }
      })

      const tag = await testPrisma.tag.create({
        data: {
          name: 'bug',
          color: '#EF4444'
        }
      })

      await testPrisma.ticketTag.create({
        data: {
          ticketId: ticket.id,
          tagId: tag.id
        }
      })

      const ticketTags = await testPrisma.ticketTag.findMany({
        where: { ticketId: ticket.id },
        include: { tag: true }
      })

      expect(ticketTags.length).toBe(1)
      expect(ticketTags[0].tag.name).toBe('bug')
    })
  })
})
