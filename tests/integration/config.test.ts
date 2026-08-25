/**
 * 配置管理 API 集成测试
 * 涵盖配置快照、变更单、漂移检测
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, initTestDatabase, DEFAULT_WORKSPACE_ID, generateTestTraceId } from './helpers'

describe('Config Management API', () => {
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

  describe('ConfigSnapshot 配置快照', () => {
    it('应该能够创建配置快照', async () => {
      const profileName = `test-profile-${Date.now()}`
      const profile = await testPrisma.connectionProfile.create({
        data: {
          name: profileName,
          baseUrl: 'http://127.0.0.1:18789',
          wsUrl: 'ws://127.0.0.1:18789',
          authMode: 'token'
        }
      })

      const configData = {
        models: {
          defaultModel: 'claude-sonnet-4',
          fallbacks: ['claude-3-opus']
        },
        hooks: {
          enabled: true,
          token: 'sk-****masked'
        }
      }

      const snapshot = await testPrisma.configSnapshot.create({
        data: {
          profileId: profile.id,
          config: JSON.stringify(configData),
          hash: 'snapshot-hash-' + Date.now()
        }
      })

      expect(snapshot.id).toBeDefined()
      expect(snapshot.profileId).toBe(profile.id)
      expect(snapshot.hash).toBeDefined()
    })

    it('应该能够查询快照历史', async () => {
      const profileName = `history-profile-${Date.now()}`
      const profile = await testPrisma.connectionProfile.create({
        data: {
          name: profileName,
          baseUrl: 'http://127.0.0.1:18789',
          wsUrl: 'ws://127.0.0.1:18789',
          authMode: 'token'
        }
      })

      // 创建多个快照
      for (let i = 0; i < 5; i++) {
        await testPrisma.configSnapshot.create({
          data: {
            profileId: profile.id,
            config: JSON.stringify({ version: i }),
            hash: `hash-${Date.now()}-${i}`
          }
        })
      }

      const snapshots = await testPrisma.configSnapshot.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' }
      })

      expect(snapshots).toHaveLength(5)
      expect(snapshots[0].config).toContain('version')
    })

    it('应该能够获取最新快照', async () => {
      const profileName = `latest-profile-${Date.now()}`
      const profile = await testPrisma.connectionProfile.create({
        data: {
          name: profileName,
          baseUrl: 'http://127.0.0.1:18789',
          wsUrl: 'ws://127.0.0.1:18789',
          authMode: 'token'
        }
      })

      await testPrisma.configSnapshot.create({
        data: {
          profileId: profile.id,
          config: JSON.stringify({ old: true }),
          hash: 'old-hash'
        }
      })

      await testPrisma.configSnapshot.create({
        data: {
          profileId: profile.id,
          config: JSON.stringify({ new: true }),
          hash: 'new-hash'
        }
      })

      const latest = await testPrisma.configSnapshot.findFirst({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' }
      })

      expect(latest!.hash).toBe('new-hash')
    })
  })

  describe('WorkspaceSnapshot 期望与实际状态', () => {
    it('应该能够创建期望状态快照', async () => {
      const snapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'DESIRED',
          source: 'LOCAL_SAVE',
          contentJson: JSON.stringify({
            models: { defaultModel: 'claude-sonnet-4' }
          }),
          contentHash: 'desired-hash-' + Date.now(),
          createdBy: 'test'
        }
      })

      expect(snapshot.id).toBeDefined()
      expect(snapshot.kind).toBe('DESIRED')
      expect(snapshot.workspaceId).toBe(DEFAULT_WORKSPACE_ID)
    })

    it('应该能够创建实际状态快照', async () => {
      const snapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'ACTUAL',
          source: 'REMOTE_SYNC',
          contentJson: JSON.stringify({
            models: { defaultModel: 'claude-3-opus' }
          }),
          contentHash: 'actual-hash-' + Date.now(),
          createdBy: 'sync'
        }
      })

      expect(snapshot.kind).toBe('ACTUAL')
      expect(snapshot.source).toBe('REMOTE_SYNC')
    })
  })

  describe('SnapshotDiff 漂移检测', () => {
    it('应该能够创建漂移记录', async () => {
      // 创建期望和实际快照
      const desiredSnapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'DESIRED',
          source: 'LOCAL_SAVE',
          contentJson: JSON.stringify({ setting: 'expected' }),
          contentHash: 'desired-hash-' + Date.now(),
          createdBy: 'test'
        }
      })

      const actualSnapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'ACTUAL',
          source: 'REMOTE_SYNC',
          contentJson: JSON.stringify({ setting: 'actual' }),
          contentHash: 'actual-hash-' + Date.now(),
          createdBy: 'sync'
        }
      })

      const diff = await testPrisma.snapshotDiff.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          desiredSnapshotId: desiredSnapshot.id,
          actualSnapshotId: actualSnapshot.id,
          diffJson: JSON.stringify([
            { op: 'replace', path: '/setting', value: 'actual' }
          ]),
          summary: '配置项 setting 发生漂移',
          severity: 'MED'
        }
      })

      expect(diff.id).toBeDefined()
      expect(diff.severity).toBe('MED')
    })

    it('应该能够按严重程度查询漂移', async () => {
      const desiredSnapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'DESIRED',
          source: 'LOCAL_SAVE',
          contentJson: JSON.stringify({}),
          contentHash: 'd-' + Date.now(),
          createdBy: 'test'
        }
      })

      const actualSnapshot = await testPrisma.workspaceSnapshot.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          kind: 'ACTUAL',
          source: 'REMOTE_SYNC',
          contentJson: JSON.stringify({}),
          contentHash: 'a-' + Date.now(),
          createdBy: 'sync'
        }
      })

      // 创建高严重程度漂移
      await testPrisma.snapshotDiff.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          desiredSnapshotId: desiredSnapshot.id,
          actualSnapshotId: actualSnapshot.id,
          diffJson: '[]',
          summary: '严重漂移',
          severity: 'HIGH'
        }
      })

      const highSeverityDiffs = await testPrisma.snapshotDiff.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          severity: 'HIGH'
        }
      })

      expect(highSeverityDiffs).toHaveLength(1)
    })
  })

  describe('ChangeRequest 变更单', () => {
    it('应该能够创建变更单', async () => {
      const traceId = generateTestTraceId()
      
      const changeRequest = await testPrisma.changeRequest.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          type: 'CONFIG',
          title: '更新模型配置',
          description: '将默认模型从 claude-sonnet-4 更新为 claude-3-5-sonnet',
          diffJson: JSON.stringify([
            { op: 'replace', path: '/models/defaultModel', value: 'claude-3-5-sonnet' }
          ]),
          status: 'DRAFT',
          traceId,
          createdBy: 'test'
        }
      })

      expect(changeRequest.id).toBeDefined()
      expect(changeRequest.status).toBe('DRAFT')
      expect(changeRequest.type).toBe('CONFIG')
    })

    it('变更单状态流转', async () => {
      const traceId = generateTestTraceId()
      
      const changeRequest = await testPrisma.changeRequest.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          type: 'CONFIG',
          title: '测试变更',
          description: '测试变更单状态流转',
          diffJson: '[]',
          status: 'DRAFT',
          traceId,
          createdBy: 'test'
        }
      })

      // 提交审批
      const pendingApproval = await testPrisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'PENDING_APPROVAL' }
      })

      expect(pendingApproval.status).toBe('PENDING_APPROVAL')

      // 审批通过
      const approved = await testPrisma.changeRequest.update({
        where: { id: changeRequest.id },
        data: { status: 'APPROVED' }
      })

      expect(approved.status).toBe('APPROVED')
    })

    it('应该能够按状态查询变更单', async () => {
      const traceId = generateTestTraceId()
      
      await testPrisma.changeRequest.create({
        data: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          type: 'CONFIG',
          title: '待审批变更',
          description: '测试',
          diffJson: '[]',
          status: 'PENDING_APPROVAL',
          traceId,
          createdBy: 'test'
        }
      })

      const pendingRequests = await testPrisma.changeRequest.findMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          status: 'PENDING_APPROVAL'
        }
      })

      expect(pendingRequests).toHaveLength(1)
    })
  })
})
