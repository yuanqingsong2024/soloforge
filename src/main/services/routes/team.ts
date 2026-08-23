/**
 * 团队管理路由模块
 *
 * 路由清单：
 * - GET    /api/roles                  获取角色列表
 * - GET    /api/roles/:id              获取角色详情
 * - POST   /api/roles                  创建角色（JSON Schema 校验）
 * - PUT    /api/roles/:id              更新角色（JSON Schema 校验）
 * - GET    /api/agents                 获取 Agent 列表
 * - POST   /api/agents                 创建 Agent（JSON Schema 校验）
 * - PUT    /api/agents/:id             更新 Agent（JSON Schema 校验）
 * - DELETE /api/agents/:id             删除 Agent
 * - POST   /api/agents/sync-to-openclaw  同步 Agent 配置到 OpenClaw（JSON Schema 校验）
 * - GET    /api/tools                  获取工具列表
 * - POST   /api/tools                  创建工具
 * - PUT    /api/tools/:id              更新工具
 * - DELETE /api/tools/:id              删除工具
 * - GET    /api/agent-tools            获取 Agent 工具授权列表
 * - POST   /api/agent-tools            创建 Agent 工具授权
 * - PUT    /api/agent-tools/:id        更新 Agent 工具授权
 * - DELETE /api/agent-tools/:id        删除 Agent 工具授权
 * - POST   /api/team/hire              一键招聘（模板化团队创建）
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { prisma, ok, fail, writeApiAuditLog, toErrorMessage, TEST_WORKSPACE_ID } from '../api-shared'

// ==================== 类型定义 ====================

interface TeamHireTemplateMember {
  roleName: string
  description: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  agentName: string
  model: string
  runtime: string
  toolScopes: string[]
}

interface TeamHireBody {
  profileId: string
  template: 'core-team' | 'support-pod'
  workspaceId?: string
}

interface TeamHireResultItem {
  roleId: string
  roleName: string
  agentId: string
  agentName: string
  grantedToolCount: number
}

// ==================== JSON Schema 定义 ====================

// PUT /api/agents/:id
const updateAgentBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      model: { type: 'string', minLength: 1 },
      runtime: { type: 'string', enum: ['cloud', 'local'] },
      enabled: { type: 'boolean' }
    }
  }
}

// POST /api/agents/sync-to-openclaw
const syncAgentsToOpenClawBodySchema = {
  body: {
    type: 'object',
    required: ['workspaceId'],
    additionalProperties: false,
    properties: {
      workspaceId: { type: 'string' }
    }
  }
}

// POST /api/roles
const createRoleBodySchema = {
  body: {
    type: 'object',
    required: ['name', 'description', 'defaultPrompt', 'outputSchema', 'riskLevel'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      defaultPrompt: { type: 'string' },
      outputSchema: { type: 'string' },
      riskLevel: { type: 'string' }
    }
  }
}

// PUT /api/roles/:id
const updateRoleBodySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      defaultPrompt: { type: 'string' },
      outputSchema: { type: 'string' },
      riskLevel: { type: 'string' }
    }
  }
}

// Agent 创建请求的 JSON Schema（Fastify 内置 Ajv 校验）
// additionalProperties: false 防止客户端注入 id/createdAt 等字段
const createAgentBodySchema = {
  body: {
    type: 'object',
    required: ['name', 'roleId', 'model'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      workspaceId: { type: 'string', minLength: 1 },
      roleId: { type: 'string', minLength: 1 },
      model: { type: 'string', minLength: 1 },
      runtime: { type: 'string', enum: ['cloud', 'local'] },
      enabled: { type: 'boolean' }
    }
  }
}

// ==================== 辅助函数 & 常量 ====================

const TEAM_HIRE_TEMPLATES: Record<'core-team' | 'support-pod', TeamHireTemplateMember[]> = {
  'core-team': [
    {
      roleName: 'Support',
      description: '处理一线客户问题与外发沟通',
      riskLevel: 'LOW',
      agentName: 'Support Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'approval', 'artifact', 'communication']
    },
    {
      roleName: 'PM',
      description: '负责需求整理、计划与交付协调',
      riskLevel: 'MEDIUM',
      agentName: 'PM Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'approval', 'workspace']
    },
    {
      roleName: 'Dev',
      description: '负责开发实现与技术修复',
      riskLevel: 'MEDIUM',
      agentName: 'Dev Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'workspace', 'config']
    },
    {
      roleName: 'QA',
      description: '负责验证、回归与质量门禁',
      riskLevel: 'LOW',
      agentName: 'QA Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact', 'approval']
    },
    {
      roleName: 'Ops',
      description: '负责环境、发布与运维响应',
      riskLevel: 'HIGH',
      agentName: 'Ops Agent',
      model: 'gpt-4.1',
      runtime: 'cloud',
      toolScopes: ['workspace', 'config', 'approval']
    }
  ],
  'support-pod': [
    {
      roleName: 'Support',
      description: '处理一线支持请求与消息回执',
      riskLevel: 'LOW',
      agentName: 'Support Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'approval', 'communication']
    },
    {
      roleName: 'QA',
      description: '负责答复校验与交付检查',
      riskLevel: 'LOW',
      agentName: 'QA Agent',
      model: 'gpt-4o-mini',
      runtime: 'cloud',
      toolScopes: ['ticket', 'artifact']
    }
  ]
}

function buildRolePrompt(profileName: string, roleName: string): string {
  return `你是 ${profileName} 环境中的 ${roleName} 员工，请遵循既有审批、审计与最小权限规则执行任务。`
}

/**
 * 解析并校验 Agent 所属工作区
 * 缺省时使用默认工作区；指定时必须存在
 */
async function resolveAgentWorkspaceId(workspaceId?: string): Promise<string> {
  const wid = workspaceId?.trim() || TEST_WORKSPACE_ID
  const workspace = await prisma.workspace.findUnique({ where: { id: wid } })
  if (!workspace) {
    throw new Error(`工作区不存在：${wid}`)
  }
  return wid
}

export async function executeTeamHire(profileId: string, template: 'core-team' | 'support-pod', workspaceId: string) {
  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new Error('Connection Profile 不存在')
  }

  const toolPool = await prisma.tool.findMany()
  const hired: TeamHireResultItem[] = []

  await prisma.$transaction(async tx => {
    for (const member of TEAM_HIRE_TEMPLATES[template]) {
      const role = await tx.role.upsert({
        where: { name: member.roleName },
        update: {
          description: member.description,
          defaultPrompt: buildRolePrompt(profile.name, member.roleName),
          outputSchema: JSON.stringify({ profileId: profile.id, profileName: profile.name, role: member.roleName }),
          riskLevel: member.riskLevel
        },
        create: {
          name: member.roleName,
          description: member.description,
          defaultPrompt: buildRolePrompt(profile.name, member.roleName),
          outputSchema: JSON.stringify({ profileId: profile.id, profileName: profile.name, role: member.roleName }),
          riskLevel: member.riskLevel
        }
      })

      const agentName = `${profile.name} · ${member.agentName}`
      const agent = await tx.agent.upsert({
        where: { workspaceId_name: { workspaceId, name: agentName } },
        update: {
          roleId: role.id,
          model: member.model,
          runtime: member.runtime,
          enabled: true
        },
        create: {
          name: agentName,
          workspaceId,
          roleId: role.id,
          model: member.model,
          runtime: member.runtime,
          enabled: true
        }
      })

      const grantedTools = toolPool.filter(tool =>
        member.toolScopes.includes(tool.scope) && tool.riskClass !== 'CRITICAL'
      )

      for (const tool of grantedTools) {
        await tx.agentTool.upsert({
          where: {
            agentId_toolId: {
              agentId: agent.id,
              toolId: tool.id
            }
          },
          update: {
            permissionJson: JSON.stringify({ level: 'template-default', profileId: profile.id })
          },
          create: {
            agentId: agent.id,
            toolId: tool.id,
            permissionJson: JSON.stringify({ level: 'template-default', profileId: profile.id })
          }
        })
      }

      hired.push({
        roleId: role.id,
        roleName: role.name,
        agentId: agent.id,
        agentName: agent.name,
        grantedToolCount: grantedTools.length
      })
    }
  })

  return { profile, hired }
}

// ==================== 路由注册 ====================

export function registerTeamRoutes(fastify: FastifyInstance): void {
  // ==================== Roles ====================
  fastify.get('/api/roles', async () => {
    return await prisma.role.findMany()
  })

  fastify.get('/api/roles/:id', async (request) => {
    const { id } = request.params as { id: string }
    return await prisma.role.findUnique({ where: { id } })
  })

  // ==================== Roles CRUD ====================
  fastify.post('/api/roles', { schema: createRoleBodySchema }, async (request) => {
    const data = request.body as {
      name: string
      description: string
      defaultPrompt: string
      outputSchema: string
      riskLevel: string
    }
    return await prisma.role.create({ data })
  })

  fastify.put('/api/roles/:id', { schema: updateRoleBodySchema }, async (request) => {
    const { id } = request.params as { id: string }
    const data = request.body as {
      name?: string
      description?: string
      defaultPrompt?: string
      outputSchema?: string
      riskLevel?: string
    }
    return await prisma.role.update({
      where: { id },
      data: Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined)) as {
        name?: string
        description?: string
        defaultPrompt?: string
        outputSchema?: string
        riskLevel?: string
      }
    })
  })

  // ==================== Agents ====================
  fastify.get('/api/agents', async (request) => {
    const { workspaceId } = request.query as { workspaceId?: string }
    return await prisma.agent.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: { role: true, tools: { include: { tool: true } } }
    })
  })

  fastify.post('/api/agents/sync-to-openclaw', { schema: syncAgentsToOpenClawBodySchema }, async (request) => {
    const { workspaceId = TEST_WORKSPACE_ID } = request.body as { workspaceId?: string }
    const traceId = uuidv4()

    try {
      const { AgentConfigSyncService } = await import('../agent-config-sync')
      const syncService = new AgentConfigSyncService()
      const result = await syncService.syncToOpenClaw(workspaceId, 'admin', traceId)

      if (result.needsApproval) {
        await writeApiAuditLog({
          workspaceId,
          traceId,
          actor: 'admin',
          action: 'AGENT_SYNC_PENDING_APPROVAL',
          tool: 'agent-config-sync',
          approvalId: result.approvalId,
          request: { workspaceId },
          response: {
            status: 'pending_approval',
            approvalId: result.approvalId
          }
        })

        return {
          success: true,
          status: 'pending_approval',
          approvalId: result.approvalId,
          message: 'Agent config sync requires approval. Please approve in Approval Center.'
        }
      }

      await writeApiAuditLog({
        workspaceId,
        traceId,
        actor: 'admin',
        action: 'AGENT_SYNCED',
        tool: 'agent-config-sync',
        request: { workspaceId },
        response: { status: 'completed' }
      })

      return {
        success: true,
        status: 'completed',
        message: 'Agent config synced to OpenClaw'
      }
    } catch (error) {
      await writeApiAuditLog({
        workspaceId,
        traceId,
        actor: 'admin',
        action: 'AGENT_SYNC_FAILED',
        tool: 'agent-config-sync',
        request: { workspaceId },
        response: {
          success: false,
          error: toErrorMessage(error)
        }
      })
      throw error
    }
  })

  fastify.post('/api/agents', { schema: createAgentBodySchema }, async (request) => {
    const traceId = uuidv4()
    const data = request.body as {
      name: string
      workspaceId?: string
      roleId: string
      model: string
      runtime?: string
      enabled?: boolean
    }

    try {
      const workspaceId = await resolveAgentWorkspaceId(data.workspaceId)
      const agent = await prisma.agent.create({
        data: {
          name: data.name,
          workspaceId,
          roleId: data.roleId,
          model: data.model,
          runtime: data.runtime || 'local',
          enabled: data.enabled !== false
        }
      })

      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_CREATED',
        tool: 'team-management',
        request: {
          workspaceId,
          data
        },
        response: {
          success: true,
          agentId: agent.id
        }
      })

      return agent
    } catch (error) {
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_CREATE_FAILED',
        tool: 'team-management',
        request: {
          workspaceId: data.workspaceId || TEST_WORKSPACE_ID,
          data
        },
        response: {
          success: false,
          error: toErrorMessage(error)
        }
      })

      throw error
    }
  })

  fastify.put('/api/agents/:id', { schema: updateAgentBodySchema }, async (request) => {
    const traceId = uuidv4()
    const { id } = request.params as { id: string }
    const data = request.body as {
      name?: string
      model?: string
      runtime?: string
      enabled?: boolean
    }

    try {
      // 先查询确认 Agent 存在，且不允许修改 workspaceId
      const existing = await prisma.agent.findUnique({ where: { id } })
      if (!existing) {
        throw new Error('Agent 不存在')
      }

      const agent = await prisma.agent.update({ where: { id }, data })

      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_UPDATED',
        tool: 'team-management',
        request: {
          workspaceId: existing.workspaceId,
          id,
          data
        },
        response: {
          success: true,
          agentId: agent.id,
          agent
        }
      })

      return agent
    } catch (error) {
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_UPDATE_FAILED',
        tool: 'team-management',
        request: {
          id,
          data
        },
        response: {
          success: false,
          error: toErrorMessage(error)
        }
      })

      throw error
    }
  })

  fastify.delete('/api/agents/:id', async (request) => {
    const traceId = uuidv4()
    const { id } = request.params as { id: string }

    try {
      const existing = await prisma.agent.findUnique({ where: { id } })
      if (!existing) {
        throw new Error('Agent 不存在')
      }

      const agent = await prisma.agent.delete({ where: { id } })

      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_DELETED',
        tool: 'team-management',
        request: {
          workspaceId: existing.workspaceId,
          id
        },
        response: {
          success: true,
          agentId: agent.id
        }
      })

      return agent
    } catch (error) {
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'AGENT_DELETE_FAILED',
        tool: 'team-management',
        request: {
          id
        },
        response: {
          success: false,
          error: toErrorMessage(error)
        }
      })

      throw error
    }
  })

  // ==================== Tools ====================
  fastify.get('/api/tools', async () => {
    return await prisma.tool.findMany()
  })

  // ==================== Tools CRUD ====================
  fastify.post('/api/tools', async (request) => {
    const data = request.body as { name: string; scope: string; riskClass: string; configSchema: string }
    return await prisma.tool.create({ data })
  })

  fastify.put('/api/tools/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = request.body as { name?: string; scope?: string; riskClass?: string; configSchema?: string }
    return await prisma.tool.update({ where: { id }, data })
  })

  fastify.delete('/api/tools/:id', async (request) => {
    const { id } = request.params as { id: string }
    return await prisma.tool.delete({ where: { id } })
  })

  // ==================== AgentTool Authorization ====================
  fastify.get('/api/agent-tools', async (request) => {
    const { agentId, workspaceId } = request.query as { agentId?: string; workspaceId?: string }
    const where: Record<string, unknown> = {}
    if (agentId) where.agentId = agentId
    if (workspaceId) where.agent = { workspaceId }
    return await prisma.agentTool.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: { agent: true, tool: true }
    })
  })

  /**
   * 校验 AgentTool 操作的工作区归属
   * 通过 agentId 查询 Agent 的 workspaceId
   */
  async function validateAgentToolWorkspace(agentId: string, expectedWorkspaceId?: string): Promise<void> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) throw new Error('Agent 不存在')
    if (expectedWorkspaceId && agent.workspaceId !== expectedWorkspaceId) {
      throw new Error('Agent 不属于当前工作区')
    }
  }

  fastify.post('/api/agent-tools', async (request) => {
    const { agentId, toolId, permissionJson, workspaceId } = request.body as { agentId: string; toolId: string; permissionJson: string; workspaceId?: string }
    if (workspaceId) await validateAgentToolWorkspace(agentId, workspaceId)
    return await prisma.agentTool.create({
      data: { agentId, toolId, permissionJson }
    })
  })

  fastify.put('/api/agent-tools/:id', async (request) => {
    const { id } = request.params as { id: string }
    const { permissionJson, workspaceId } = request.body as { permissionJson: string; workspaceId?: string }
    if (workspaceId) {
      const existing = await prisma.agentTool.findUnique({ where: { id }, include: { agent: true } })
      if (existing && existing.agent.workspaceId !== workspaceId) {
        throw new Error('AgentTool 不属于当前工作区')
      }
    }
    return await prisma.agentTool.update({
      where: { id },
      data: { permissionJson }
    })
  })

  fastify.delete('/api/agent-tools/:id', async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as { workspaceId?: string }
    if (query.workspaceId) {
      const existing = await prisma.agentTool.findUnique({ where: { id }, include: { agent: true } })
      if (existing && existing.agent.workspaceId !== query.workspaceId) {
        throw new Error('AgentTool 不属于当前工作区')
      }
    }
    return await prisma.agentTool.delete({ where: { id } })
  })

  // ==================== Team Hire ====================
  fastify.post('/api/team/hire', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const body = request.body as TeamHireBody

    try {
      if (!body.profileId) {
        reply.code(400)
        return fail('profileId 不能为空')
      }
      if (!body.template || !(body.template in TEAM_HIRE_TEMPLATES)) {
        reply.code(400)
        return fail('template 无效')
      }

      const workspaceId = await resolveAgentWorkspaceId(body.workspaceId)
      const { profile, hired } = await executeTeamHire(body.profileId, body.template, workspaceId)

      await writeApiAuditLog({
        traceId,
        actor,
        action: 'TEAM_HIRE_TEMPLATE',
        tool: 'team-management',
        request: {
          workspaceId,
          profileId: profile.id,
          profileName: profile.name,
          template: body.template
        },
        response: {
          hiredCount: hired.length,
          hiredAgents: hired.map(item => item.agentName)
        }
      })

      return ok({
        workspaceId,
        profileId: profile.id,
        profileName: profile.name,
        template: body.template,
        hired
      })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      await writeApiAuditLog({
        traceId,
        actor,
        action: 'TEAM_HIRE_TEMPLATE',
        tool: 'team-management',
        request: body,
        response: fail(errMsg)
      })
      reply.code(500)
      return fail(`一键招聘失败：${errMsg}`)
    }
  })
}
