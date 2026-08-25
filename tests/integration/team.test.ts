/**
 * 团队管理（Team）API 集成测试
 * 涵盖 Role、Agent、Tool、AgentTool
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanupTestData, initTestDatabase, DEFAULT_WORKSPACE_ID } from './helpers'

describe('Team API', () => {
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

  describe('Role 管理', () => {
    it('应该能够创建岗位', async () => {
      const uniqueName = `Developer-${Date.now()}`
      const role = await testPrisma.role.create({
        data: {
          name: uniqueName,
          description: '开发工程师',
          defaultPrompt: '你是一个开发工程师，负责代码开发任务',
          outputSchema: JSON.stringify({
            type: 'object',
            properties: {
              code: { type: 'string' },
              explanation: { type: 'string' }
            }
          }),
          riskLevel: 'MEDIUM'
        }
      })

      expect(role.id).toBeDefined()
      expect(role.name).toBe(uniqueName)
      expect(role.riskLevel).toBe('MEDIUM')
    })

    it('应该能够查询岗位列表', async () => {
      const role1Name = `Support-${Date.now()}-1`
      const role2Name = `Developer-${Date.now()}-2`
      const role3Name = `QA-${Date.now()}-3`
      
      await Promise.all([
        testPrisma.role.create({
          data: {
            name: role1Name,
            description: '客服',
            defaultPrompt: '',
            outputSchema: '{}',
            riskLevel: 'LOW'
          }
        }),
        testPrisma.role.create({
          data: {
            name: role2Name,
            description: '开发',
            defaultPrompt: '',
            outputSchema: '{}',
            riskLevel: 'MEDIUM'
          }
        }),
        testPrisma.role.create({
          data: {
            name: role3Name,
            description: '测试',
            defaultPrompt: '',
            outputSchema: '{}',
            riskLevel: 'LOW'
          }
        })
      ])

      const roles = await testPrisma.role.findMany()
      expect(roles.length).toBeGreaterThanOrEqual(3)
    })

    it('岗位名称应该唯一', async () => {
      const uniqueName = `UniqueRole-${Date.now()}`
      
      await testPrisma.role.create({
        data: {
          name: uniqueName,
          description: '测试唯一性',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'LOW'
        }
      })

      await expect(
        testPrisma.role.create({
          data: {
            name: uniqueName,
            description: '重复名称',
            defaultPrompt: '',
            outputSchema: '{}',
            riskLevel: 'LOW'
          }
        })
      ).rejects.toThrow()
    })
  })

  describe('Agent 管理', () => {
    it('应该能够创建 Agent', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud',
          enabled: true
        }
      })

      expect(agent.id).toBeDefined()
      expect(agent.roleId).toBe(role.id)
      expect(agent.model).toBe('claude-sonnet-4')
    })

    it('应该能够查询 Agent 及其岗位', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const agent = await testPrisma.agent.findFirst({
        where: { name: agentName },
        include: { role: true }
      })

      expect(agent).toBeDefined()
      expect(agent!.role.name).toBe(roleName)
    })

    it('Agent 可以启用/禁用', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `ToggleAgent-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud',
          enabled: false
        }
      })

      expect(agent.enabled).toBe(false)

      const updated = await testPrisma.agent.update({
        where: { id: agent.id },
        data: { enabled: true }
      })

      expect(updated.enabled).toBe(true)
    })

    it('Agent 支持不同运行环境', async () => {
      const roleName = `DevRole-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const cloudAgent = await testPrisma.agent.create({
        data: {
          name: `CloudAgent-${Date.now()}`,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const localAgent = await testPrisma.agent.create({
        data: {
          name: `LocalAgent-${Date.now()}`,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-3-5-sonnet-20241022',
          runtime: 'local'
        }
      })

      expect(cloudAgent.runtime).toBe('cloud')
      expect(localAgent.runtime).toBe('local')
    })

    it('Agent 按工作区隔离，不同工作区可同名', async () => {
      // 创建第二个工作区
      const wsName = `第二工作区-${Date.now()}`
      const otherWs = await testPrisma.workspace.create({
        data: { name: wsName, description: '用于隔离测试' }
      })

      const role = await testPrisma.role.create({
        data: {
          name: `SharedRole-${Date.now()}`,
          description: '共享角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'LOW'
        }
      })

      const sharedName = `同名Agent-${Date.now()}`
      const agentA = await testPrisma.agent.create({
        data: {
          name: sharedName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'model-a',
          runtime: 'cloud'
        }
      })
      const agentB = await testPrisma.agent.create({
        data: {
          name: sharedName,
          workspaceId: otherWs.id,
          roleId: role.id,
          model: 'model-b',
          runtime: 'local'
        }
      })

      expect(agentA.id).not.toBe(agentB.id)

      // 查询应只返回指定工作区的 Agent
      const defaultWsAgents = await testPrisma.agent.findMany({ where: { workspaceId: DEFAULT_WORKSPACE_ID } })
      const otherWsAgents = await testPrisma.agent.findMany({ where: { workspaceId: otherWs.id } })

      expect(defaultWsAgents.some(a => a.id === agentB.id)).toBe(false)
      expect(otherWsAgents.some(a => a.id === agentA.id)).toBe(false)
    })
  })

  describe('Tool 管理', () => {
    it('应该能够创建工具', async () => {
      const toolName = `ReadTool-${Date.now()}`
      
      const tool = await testPrisma.tool.create({
        data: {
          name: toolName,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: JSON.stringify({
            allowedPaths: ['/home/**']
          })
        }
      })

      expect(tool.id).toBeDefined()
      expect(tool.name).toBe(toolName)
      expect(tool.riskClass).toBe('LOW')
    })

    it('应该能够查询工具列表', async () => {
      await Promise.all([
        testPrisma.tool.create({
          data: {
            name: `Tool1-${Date.now()}`,
            scope: 'file',
            riskClass: 'LOW',
            configSchema: '{}'
          }
        }),
        testPrisma.tool.create({
          data: {
            name: `Tool2-${Date.now()}`,
            scope: 'command',
            riskClass: 'MEDIUM',
            configSchema: '{}'
          }
        })
      ])

      const tools = await testPrisma.tool.findMany()
      expect(tools.length).toBeGreaterThanOrEqual(2)
    })

    it('工具风险等级分类', async () => {
      const lowRiskTool = await testPrisma.tool.create({
        data: {
          name: `LowRiskTool-${Date.now()}`,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: '{}'
        }
      })

      const highRiskTool = await testPrisma.tool.create({
        data: {
          name: `HighRiskTool-${Date.now()}`,
          scope: 'database',
          riskClass: 'HIGH',
          configSchema: '{}'
        }
      })

      expect(lowRiskTool.riskClass).toBe('LOW')
      expect(highRiskTool.riskClass).toBe('HIGH')
    })
  })

  describe('AgentTool 授权', () => {
    it('应该能够授权工具给 Agent', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      const toolName = `ReadTool-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const tool = await testPrisma.tool.create({
        data: {
          name: toolName,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: '{}'
        }
      })

      const agentTool = await testPrisma.agentTool.create({
        data: {
          agentId: agent.id,
          toolId: tool.id,
          permissionJson: JSON.stringify({
            allowedPaths: ['/home/**', '/tmp/**']
          })
        }
      })

      expect(agentTool.id).toBeDefined()
      expect(agentTool.agentId).toBe(agent.id)
      expect(agentTool.toolId).toBe(tool.id)
    })

    it('应该能够查询 Agent 的工具列表', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const tool1 = await testPrisma.tool.create({
        data: {
          name: `Tool1-${Date.now()}`,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: '{}'
        }
      })

      const tool2 = await testPrisma.tool.create({
        data: {
          name: `Tool2-${Date.now()}`,
          scope: 'command',
          riskClass: 'MEDIUM',
          configSchema: '{}'
        }
      })

      await Promise.all([
        testPrisma.agentTool.create({
          data: {
            agentId: agent.id,
            toolId: tool1.id,
            permissionJson: '{}'
          }
        }),
        testPrisma.agentTool.create({
          data: {
            agentId: agent.id,
            toolId: tool2.id,
            permissionJson: '{}'
          }
        })
      ])

      const agentTools = await testPrisma.agentTool.findMany({
        where: { agentId: agent.id },
        include: { tool: true }
      })

      expect(agentTools).toHaveLength(2)
    })

    it('同一 Agent-Tool 组合唯一', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      const toolName = `ReadTool-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const tool = await testPrisma.tool.create({
        data: {
          name: toolName,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: '{}'
        }
      })

      await testPrisma.agentTool.create({
        data: {
          agentId: agent.id,
          toolId: tool.id,
          permissionJson: '{}'
        }
      })

      await expect(
        testPrisma.agentTool.create({
          data: {
            agentId: agent.id,
            toolId: tool.id,
            permissionJson: '{}'
          }
        })
      ).rejects.toThrow()
    })

    it('删除 Agent 时自动删除授权', async () => {
      const roleName = `DevRole-${Date.now()}`
      const agentName = `TestAgent-${Date.now()}`
      const toolName = `ReadTool-${Date.now()}`
      
      const role = await testPrisma.role.create({
        data: {
          name: roleName,
          description: '开发角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'MEDIUM'
        }
      })

      const agent = await testPrisma.agent.create({
        data: {
          name: agentName,
          workspaceId: DEFAULT_WORKSPACE_ID,
          roleId: role.id,
          model: 'claude-sonnet-4',
          runtime: 'cloud'
        }
      })

      const tool = await testPrisma.tool.create({
        data: {
          name: toolName,
          scope: 'file',
          riskClass: 'LOW',
          configSchema: '{}'
        }
      })

      await testPrisma.agentTool.create({
        data: {
          agentId: agent.id,
          toolId: tool.id,
          permissionJson: '{}'
        }
      })

      await testPrisma.agent.delete({
        where: { id: agent.id }
      })

      const agentTools = await testPrisma.agentTool.findMany({
        where: { agentId: agent.id }
      })

      expect(agentTools).toHaveLength(0)
    })
  })

  describe('角色与风险等级', () => {
    it('高风险角色应该有相应标记', async () => {
      const role = await testPrisma.role.create({
        data: {
          name: `HighRiskRole-${Date.now()}`,
          description: '高风险操作角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'HIGH'
        }
      })

      expect(role.riskLevel).toBe('HIGH')
    })

    it('低风险角色应该有相应标记', async () => {
      const role = await testPrisma.role.create({
        data: {
          name: `LowRiskRole-${Date.now()}`,
          description: '低风险操作角色',
          defaultPrompt: '',
          outputSchema: '{}',
          riskLevel: 'LOW'
        }
      })

      expect(role.riskLevel).toBe('LOW')
    })
  })
})
