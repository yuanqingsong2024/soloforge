import { prisma } from './db'
import { writeAuditLog } from './audit-log-writer'

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * 配置 Patch 接口
 * 用于同步 Agent 配置到 OpenClaw
 */
export interface ConfigPatch {
  models: {
    allowlist: string[]
    defaultModel: string
  }
  tools: {
    allow: string[]
  }
}

/**
 * Agent 配置同步服务
 * 负责将启用的 Agent 配置同步到 OpenClaw
 */
export class AgentConfigSyncService {
  /**
   * 从启用的 Agent 生成配置 patch
   * @param workspaceId - Workspace ID
   * @returns 配置 patch
   */
  async generateConfigPatch(workspaceId: string): Promise<ConfigPatch> {
    const enabledAgents = await prisma.agent.findMany({
      where: {
        enabled: true
      },
      include: {
        tools: {
          include: { tool: true }
        }
      }
    })

    void workspaceId

    // 收集所有启用 Agent 的模型
    const models = [...new Set(enabledAgents.map(a => a.model).filter(Boolean))]
    
    // 收集所有启用 Agent 的工具
    const tools = [...new Set(
      enabledAgents.flatMap((agent) => agent.tools.map((agentTool) => agentTool.tool.name))
    )]

    return {
      models: {
        allowlist: models,
        defaultModel: models[0] || 'gpt-4'
      },
      tools: {
        allow: tools
      }
    }
  }

  /**
   * 同步到 OpenClaw（走审批流程）
   * @param workspaceId - Workspace ID
   * @param requestedBy - 请求人
   * @param traceId - 追踪 ID
   * @returns 审批 ID 和是否需要审批
   */
  async syncToOpenClaw(
    workspaceId: string, 
    requestedBy: string, 
    traceId: string
  ): Promise<{ approvalId?: string; needsApproval: boolean }> {
    const patch = await this.generateConfigPatch(workspaceId)
    
    // 导入 ApprovalGuard
    const { ApprovalGuard } = await import('./approval-guard')
    
    return await ApprovalGuard.executeProtected(
      'CHANGE_CONFIG',
      { workspaceId, patch, action: 'sync_agents', traceId },
      requestedBy,
      async () => {
        // 这个 executor 只有在审批通过后才会执行
        await this.applyPatch(workspaceId, patch, traceId)
      }
    )
  }

  /**
   * 审批通过后应用配置
   * @param approvalId - 审批 ID
   * @param traceId - 追踪 ID
   */
  async applySyncAfterApproval(approvalId: string, traceId: string): Promise<void> {
    // 1. 查询审批记录
    const approval = await prisma.approval.findUnique({ 
      where: { id: approvalId } 
    })
    
    if (!approval || approval.status !== 'APPROVED') {
      throw new Error('Approval not found or not approved')
    }

    // 2. 解析 payload
    const payload = JSON.parse(approval.payload)
    const { workspaceId, patch } = payload

    if (!workspaceId || !patch) {
      throw new Error('Invalid approval payload: missing workspaceId or patch')
    }

    // 3. 应用 patch
    await this.applyPatch(workspaceId, patch, traceId)

    // 4. 写审计日志
    await writeAuditLog({
      workspaceId,
      traceId,
      actor: 'system',
      action: 'AGENT_CONFIG_SYNCED',
      approvalId,
      request: { patch },
      response: { success: true }
    })
  }

  /**
   * 应用配置 patch（内部方法）
   * @param workspaceId - Workspace ID
   * @param patch - 配置 patch
   * @param traceId - 追踪 ID
   */
  private async applyPatch(
    workspaceId: string, 
    patch: ConfigPatch, 
    traceId: string
  ): Promise<void> {
    try {
      // 3. 获取 OpenClaw 客户端
      const { resolveWorkspaceOpenClawClient } = await import('./workspace-openclaw')
      const { client } = await resolveWorkspaceOpenClawClient(workspaceId)

      // 4. 读取当前配置
      const currentConfig = await client.getConfig(traceId)
      const currentConfigRecord = toRecord(currentConfig)
      const currentModels = toRecord(currentConfigRecord.models)
      const currentTools = toRecord(currentConfigRecord.tools)

      // 5. 合并 patch
      const newConfig = {
        ...currentConfigRecord,
        models: {
          ...currentModels,
          ...patch.models
        },
        tools: {
          ...currentTools,
          ...patch.tools
        }
      }

      // 6. 保存 Desired Snapshot
      const { ConfigManager } = await import('./config-manager')
      await ConfigManager.saveDesiredSnapshot(workspaceId, newConfig, 'system')

      // 7. 应用配置
      await client.applyConfig(newConfig, traceId)

      // 8. 同步 Actual Snapshot
      const actualSnapshot = await client.getConfigSnapshot(traceId)
      await ConfigManager.syncActualSnapshot(workspaceId, actualSnapshot.config, 'system')
    } catch (error) {
      // 写入失败审计日志
      await writeAuditLog({
        workspaceId,
        traceId,
        actor: 'system',
        action: 'AGENT_CONFIG_SYNC_FAILED',
        request: { patch },
        response: {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      })
      throw error
    }
  }
}
