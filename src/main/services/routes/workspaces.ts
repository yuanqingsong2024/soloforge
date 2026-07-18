/**
 * Workspaces 路由模块
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma, isE2ETestMode, TEST_WORKSPACE_ID, TEST_WORKSPACE_NAME } from '../api-shared'
import { ApprovalGuard } from '../approval-guard'
import { auditedRoute } from '../../middleware/audit-wrapper'

// ==================== JSON Schema 定义 ====================

const createWorkspaceBodySchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' }
    }
  }
}

const importWorkspaceBodySchema = {
  body: {
    type: 'object',
    required: ['name', 'id'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      id: { type: 'string' },
      description: { type: 'string' },
      policies: {
        type: 'array',
        items: {
          type: 'object',
          required: ['policyJson'],
          properties: {
            policyJson: { type: 'string' },
            version: { type: 'integer' }
          }
        }
      }
    }
  }
}

// ==================== 路由注册函数 ====================

export function registerWorkspacesRoutes(fastify: FastifyInstance): void {
  // GET /api/workspaces - 获取所有工作区列表
  fastify.get('/api/workspaces', async () => {
    if (isE2ETestMode()) {
      return [
        {
          id: TEST_WORKSPACE_ID,
          name: TEST_WORKSPACE_NAME,
          description: '本地默认工作区',
          envType: 'DEV',
          profiles: [],
          policies: [],
          _count: { tickets: 0, jobs: 0 }
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Remote Workspace',
          description: '用于 E2E 的固定工作区',
          envType: 'STAGING',
          profiles: [],
          policies: [],
          _count: { tickets: 0, jobs: 0 }
        }
      ]
    }

    const workspaces = await prisma.workspace.findMany({
      include: {
        profiles: { include: { profile: true } },
        policies: true,
        _count: { select: { tickets: true, jobs: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return workspaces
  })

  // GET /api/workspaces/:id - 获取单个工作区详情
  fastify.get('/api/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    if (isE2ETestMode()) {
      const workspaces = [
        {
          id: TEST_WORKSPACE_ID,
          name: TEST_WORKSPACE_NAME,
          description: '本地默认工作区',
          envType: 'DEV',
          isReadOnlyDefault: false,
          unlockUntil: null,
          profiles: [],
          policies: [],
          _count: { tickets: 0, jobs: 0, contacts: 0 }
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Remote Workspace',
          description: '用于 E2E 的固定工作区',
          envType: 'STAGING',
          isReadOnlyDefault: false,
          unlockUntil: null,
          profiles: [],
          policies: [],
          _count: { tickets: 0, jobs: 0, contacts: 0 }
        }
      ]

      const workspace = workspaces.find(item => item.id === id)
      if (!workspace) {
        reply.code(404)
        return { error: 'Workspace not found' }
      }

      return workspace
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        profiles: { include: { profile: true } },
        policies: true,
        _count: { select: { tickets: true, jobs: true, contacts: true } }
      }
    })
    
    if (!workspace) {
      reply.code(404)
      return { error: 'Workspace not found' }
    }
    
    return workspace
  })

  // POST /api/workspaces - 创建工作区（使用审计包装器）
  fastify.post('/api/workspaces', { schema: createWorkspaceBodySchema },
    auditedRoute({
      action: 'WORKSPACE_CREATED',
      tool: 'workspaces',
      workspaceIdParam: false, // 新建工作区时尚无 workspaceId
      logResponse: true,
      handler: async (request: FastifyRequest) => {
        const { name, description } = request.body as { name: string; description?: string }
        
        const workspace = await prisma.workspace.create({
          data: {
            name,
            description: description || '',
            policies: {
              create: {
                policyJson: JSON.stringify({
                  tools_policy: { deny: ['deploy', 'delete_database', 'execute_shell'] },
                  comms_policy: { allowed_targets: [] },
                  config_policy: { allowed_paths: ['models.*', 'hooks.enabled', 'tools.allow'] },
                  approval_policy: { required_actions: [] }
                }),
                version: 1
              }
            }
          },
          include: { policies: true }
        })
        
        return workspace
      }
    })
  )

  // PATCH /api/workspaces/:id - 更新工作区（使用审计包装器）
  fastify.patch('/api/workspaces/:id',
    auditedRoute({
      action: 'WORKSPACE_UPDATED',
      tool: 'workspaces',
      workspaceIdParam: 'id',
      logResponse: false, // 避免重复序列化整个 workspace
      handler: async (request: FastifyRequest) => {
        const { id } = request.params as { id: string }
        const { name, description } = request.body as { name?: string; description?: string }
        
        const workspace = await prisma.workspace.update({
          where: { id },
          data: { name, description }
        })
        
        return workspace
      }
    })
  )

  // DELETE /api/workspaces/:id - 删除工作区（需要 EXPORT_DATA 审批）
  fastify.delete('/api/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    
    const approvalResult = await ApprovalGuard.executeProtected(
      'EXPORT_DATA',
      { workspaceId: id },
      'admin',
      async () => {
        await prisma.workspace.delete({ where: { id } })
        return { deleted: true }
      }
    )
    
    if (approvalResult.needsApproval) {
      reply.code(202)
      return { message: 'Approval required', approvalId: approvalResult.approvalId }
    }
    
    return approvalResult.result
  })

  // POST /api/workspaces/:id/profiles - 添加连接配置到工作区
  fastify.post('/api/workspaces/:id/profiles', async (request) => {
    const { id } = request.params as { id: string }
    const { profileId, isDefault } = request.body as { profileId: string; isDefault?: boolean }
    
    if (isDefault) {
      await prisma.workspaceProfile.updateMany({
        where: { workspaceId: id },
        data: { isDefault: false }
      })
    }
    
    const workspaceProfile = await prisma.workspaceProfile.create({
      data: {
        workspaceId: id,
        profileId,
        isDefault: isDefault || false
      },
      include: { profile: true }
    })
    
    return workspaceProfile
  })

  // GET /api/workspaces/:id/export - 导出工作区
  fastify.get('/api/workspaces/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string }
    
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        profiles: { include: { profile: true } },
        policies: true,
        tickets: { include: { artifacts: true } },
        contacts: { include: { contactTargets: true } },
        commsTargets: true
      }
    })
    
    if (!workspace) {
      reply.code(404)
      return { error: 'Workspace not found' }
    }
    
    const exportData = {
      ...workspace,
      profiles: workspace.profiles.map(p => ({
        ...p,
        profile: {
          ...p.profile,
          authMode: p.profile.authMode,
          baseUrl: p.profile.baseUrl,
          wsUrl: p.profile.wsUrl
        }
      })),
      _meta: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        note: 'Credentials not included. Please re-enter tokens/passwords after import.'
      }
    }
    
    reply.header('Content-Type', 'application/json')
    reply.header('Content-Disposition', `attachment; filename="workspace-${workspace.name}-${Date.now()}.json"`)
    return exportData
  })

  // POST /api/workspaces/import - 导入工作区
  fastify.post('/api/workspaces/import', { schema: importWorkspaceBodySchema }, async (request, reply) => {
    const importData = request.body as {
      name: string
      id: string
      description?: string
      policies?: Array<{ policyJson: string; version?: number }>
    }
    
    if (!importData.name || !importData.id) {
      reply.code(400)
      return { error: 'Invalid import data' }
    }
    
    const existing = await prisma.workspace.findFirst({
      where: { name: importData.name }
    })
    
    if (existing) {
      reply.code(409)
      return { error: 'Workspace with this name already exists' }
    }
    
    const workspace = await prisma.workspace.create({
      data: {
        name: importData.name,
        description: importData.description || '',
        policies: {
          create: importData.policies?.map((p: { policyJson: string; version?: number }) => ({
            policyJson: p.policyJson,
            version: p.version || 1
          })) || []
        }
      }
    })
    
    return {
      workspace,
      message: 'Workspace imported successfully. Please configure connection profiles and re-enter credentials.'
    }
  })
}
